import { motion, AnimatePresence } from 'motion/react';
import { MapPin, Sparkles, Zap, Target, TrendingUp, Check } from 'lucide-react';
import { useState, useEffect } from 'react';

interface SpotDiscoveryCuratingProps {
  isDarkMode: boolean;
  onComplete: () => void;
}

type DiscoveryStage = {
  id: string;
  title: string;
  description: string;
  icon: JSX.Element;
  progress: number;
  color: string;
};

const discoveryStages: DiscoveryStage[] = [
  {
    id: 'analyzing',
    title: 'Analyzing Preferences',
    description: 'Processing your vibe profile and interests',
    icon: <Sparkles className="w-6 h-6" />,
    progress: 20,
    color: 'from-purple-500 to-fuchsia-500',
  },
  {
    id: 'scanning',
    title: 'Scanning Area',
    description: '360° radar discovering nearby spots',
    icon: <Target className="w-6 h-6" />,
    progress: 40,
    color: 'from-cyan-500 to-blue-500',
  },
  {
    id: 'matching',
    title: 'Matching Algorithm',
    description: 'AI-powered preference matching in progress',
    icon: <Zap className="w-6 h-6" />,
    progress: 60,
    color: 'from-orange-500 to-amber-500',
  },
  {
    id: 'realtime',
    title: 'Live Data Integration',
    description: 'Fetching real-time availability and pricing',
    icon: <TrendingUp className="w-6 h-6" />,
    progress: 80,
    color: 'from-green-500 to-emerald-500',
  },
  {
    id: 'complete',
    title: 'Discovery Complete',
    description: 'Your personalized spots are ready',
    icon: <Check className="w-6 h-6" />,
    progress: 100,
    color: 'from-pink-500 to-rose-500',
  },
];

export function SpotDiscoveryCurating({ isDarkMode, onComplete }: SpotDiscoveryCuratingProps) {
  const [currentStage, setCurrentStage] = useState(0);
  const [progress, setProgress] = useState(0);
  const [spotsFound, setSpotsFound] = useState(0);

  const springConfig = {
    type: "spring" as const,
    stiffness: 320,
    damping: 30,
    mass: 0.8,
  };

  useEffect(() => {
    // Progress animation - single interval
    const progressInterval = setInterval(() => {
      setProgress((prev) => {
        const newProgress = prev + 2; // Faster progression
        
        // Update stage based on progress
        if (newProgress >= 100) {
          clearInterval(progressInterval);
          setCurrentStage(4);
          // Auto-complete after showing success
          setTimeout(() => {
            onComplete();
          }, 1500);
          return 100;
        } else if (newProgress >= 80) {
          setCurrentStage(3);
        } else if (newProgress >= 60) {
          setCurrentStage(2);
        } else if (newProgress >= 40) {
          setCurrentStage(1);
        }
        
        return newProgress;
      });
      
      // Update spots found in same interval
      setSpotsFound((prev) => {
        if (prev >= 147) return 147;
        return prev + Math.floor(Math.random() * 8) + 2;
      });
    }, 120);

    return () => {
      clearInterval(progressInterval);
    };
  }, [onComplete]);

  const stage = discoveryStages[currentStage];

  return (
    <div className="min-h-screen overflow-hidden bg-[#000000]">
      {/* Background gradients - simplified */}
      <div className="absolute inset-0">
        <div className="absolute inset-0 bg-[#000000]" />
        <div className="absolute inset-0 opacity-30 pointer-events-none">
          <div
            className="absolute top-[20%] left-1/2 -translate-x-1/2 w-[600px] h-[600px]"
            style={{ background: `radial-gradient(circle, rgba(168, 85, 247, 0.25) 0%, transparent 70%)` }}
          />
          <div
            className="absolute bottom-[10%] left-1/2 -translate-x-1/2 w-[500px] h-[500px]"
            style={{ background: `radial-gradient(circle, rgba(0, 191, 255, 0.2) 0%, transparent 70%)` }}
          />
        </div>
      </div>

      <div className="relative max-w-[393px] mx-auto min-h-screen flex flex-col px-6 py-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={springConfig}
          className="flex-1 flex flex-col justify-center"
        >
          {/* Header */}
          <div className="text-center mb-8">
            <motion.h1
              className="text-large-title mb-4 text-white"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.1 }}
            >
              Discovering Spots
            </motion.h1>

            <motion.p
              className="text-[17px] text-white/90 max-w-[320px] mx-auto"
              style={{ fontWeight: 400 }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2 }}
            >
              AI-powered curation in progress
            </motion.p>
          </div>

          {/* Simplified Radar Animation */}
          <motion.div
            className="relative w-64 h-64 mx-auto mb-12"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.3 }}
          >
            {/* Outer rings - reduced to 3 */}
            {[1, 2, 3].map((ring) => (
              <div
                key={ring}
                className="absolute inset-0 rounded-full border-2 border-cyan-500/20"
                style={{
                  width: `${ring * 33}%`,
                  height: `${ring * 33}%`,
                  top: `${(100 - ring * 33) / 2}%`,
                  left: `${(100 - ring * 33) / 2}%`,
                }}
              />
            ))}

            {/* Center dot */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-cyan-400 shadow-lg shadow-cyan-400/50" />

            {/* Rotating radar sweep */}
            <motion.div
              className="absolute top-1/2 left-1/2 origin-left"
              style={{
                width: '50%',
                height: '2px',
                background: 'linear-gradient(to right, rgba(0, 191, 255, 0.8), transparent)',
              }}
              animate={{ rotate: 360 }}
              transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
            />

            {/* Reduced floating spots to 6 */}
            {Array.from({ length: 6 }).map((_, i) => {
              const angle = i * 60;
              const distance = 35 + (i % 2) * 25;
              const x = Math.cos((angle * Math.PI) / 180) * distance;
              const y = Math.sin((angle * Math.PI) / 180) * distance;
              
              return (
                <motion.div
                  key={i}
                  className="absolute top-1/2 left-1/2 w-2 h-2 rounded-full"
                  style={{
                    background: i % 3 === 0 ? '#00BFFF' : i % 3 === 1 ? '#A855F7' : '#FF4500',
                    x,
                    y,
                    translateX: '-50%',
                    translateY: '-50%',
                  }}
                  animate={{
                    scale: [1, 1.3, 1],
                    opacity: [0.6, 1, 0.6],
                  }}
                  transition={{
                    duration: 2,
                    repeat: Infinity,
                    delay: i * 0.3,
                  }}
                />
              );
            })}

            {/* Single pulse effect */}
            <motion.div
              className="absolute inset-0 rounded-full border-2 border-cyan-400/50"
              animate={{
                scale: [1, 1.4],
                opacity: [0.5, 0],
              }}
              transition={{
                duration: 2,
                repeat: Infinity,
              }}
            />
          </motion.div>

          {/* Current Stage */}
          <AnimatePresence mode="wait">
            <motion.div
              key={currentStage}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={springConfig}
              className="mb-8"
            >
              <div className="text-center mb-4">
                <div
                  className={`w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center bg-gradient-to-br ${stage.color} text-white`}
                >
                  {stage.icon}
                </div>

                <h3 className="text-[20px] mb-2 text-white" style={{ fontWeight: 600 }}>
                  {stage.title}
                </h3>
                <p className="text-[15px] text-white/70" style={{ fontWeight: 400 }}>
                  {stage.description}
                </p>
              </div>
            </motion.div>
          </AnimatePresence>

          {/* Progress Bar */}
          <div className="mb-8">
            <div className="flex items-center justify-between mb-2 px-1">
              <span className="text-[13px] text-white/70" style={{ fontWeight: 500 }}>
                Progress
              </span>
              <span className="text-[13px] text-white" style={{ fontWeight: 600 }}>
                {progress}%
              </span>
            </div>
            <div className="h-2 rounded-full bg-white/10 overflow-hidden">
              <motion.div
                className="h-full bg-gradient-to-r from-cyan-500 via-purple-500 to-pink-500"
                initial={{ width: '0%' }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.3 }}
              />
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 gap-3 mb-8">
            <motion.div
              className="rounded-[16px] p-4 border-2 border-white/30 bg-[#1C1C1E]/80 backdrop-blur-xl shadow-xl text-center"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.4 }}
            >
              <div className="text-[28px] mb-1 text-white" style={{ fontWeight: 700 }}>
                {spotsFound}
              </div>
              <div className="text-[13px] text-white/70" style={{ fontWeight: 500 }}>
                Spots Found
              </div>
            </motion.div>

            <motion.div
              className="rounded-[16px] p-4 border-2 border-white/30 bg-[#1C1C1E]/80 backdrop-blur-xl shadow-xl text-center"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.5 }}
            >
              <div className="text-[28px] mb-1 text-white" style={{ fontWeight: 700 }}>
                {Math.min(currentStage + 1, 5)}/5
              </div>
              <div className="text-[13px] text-white/70" style={{ fontWeight: 500 }}>
                Stages Complete
              </div>
            </motion.div>
          </div>

          {/* Processing Steps */}
          <motion.div
            className="space-y-2"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
          >
            {discoveryStages.map((stg, index) => {
              const isComplete = index < currentStage;
              const isCurrent = index === currentStage;

              return (
                <motion.div
                  key={stg.id}
                  className={`flex items-center gap-3 p-3 rounded-[12px] border transition-all ${
                    isComplete
                      ? 'border-green-400/50 bg-green-500/10'
                      : isCurrent
                      ? 'border-cyan-400/50 bg-cyan-500/10'
                      : 'border-white/20 bg-white/5'
                  }`}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.7 + index * 0.05 }}
                >
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                      isComplete
                        ? 'bg-green-500/30'
                        : isCurrent
                        ? 'bg-cyan-500/30'
                        : 'bg-white/10'
                    }`}
                  >
                    {isComplete ? (
                      <Check className="w-4 h-4 text-green-400" strokeWidth={3} />
                    ) : (
                      <div className={`text-[12px] ${isCurrent ? 'text-cyan-400' : 'text-white/50'}`} style={{ fontWeight: 600 }}>
                        {index + 1}
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p
                      className={`text-[13px] truncate ${
                        isComplete ? 'text-green-400' : isCurrent ? 'text-cyan-400' : 'text-white/50'
                      }`}
                      style={{ fontWeight: 600 }}
                    >
                      {stg.title}
                    </p>
                  </div>
                  {isCurrent && (
                    <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 flex-shrink-0" />
                  )}
                </motion.div>
              );
            })}
          </motion.div>

          {/* Success Message */}
          <AnimatePresence>
            {currentStage === 4 && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="mt-6 p-4 rounded-[16px] bg-gradient-to-br from-green-500/20 to-emerald-500/20 border-2 border-green-400/50"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-green-500/30 flex items-center justify-center">
                    <Check className="w-5 h-5 text-green-400" strokeWidth={3} />
                  </div>
                  <div className="flex-1">
                    <p className="text-[15px] text-green-400 mb-1" style={{ fontWeight: 600 }}>
                      All Set!
                    </p>
                    <p className="text-[13px] text-white/70" style={{ fontWeight: 400 }}>
                      Redirecting to your personalized feed...
                    </p>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
    </div>
  );
}
