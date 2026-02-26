import { motion, AnimatePresence } from 'motion/react';
import { ArrowLeft, Sparkles, Save, TrendingUp, Users, DollarSign, MapPin, Clock, Utensils, Heart, Brain, Zap, Crown, ChevronRight, Check } from 'lucide-react';
import { useState, useMemo } from 'react';
import { toast } from 'sonner@2.0.3';

interface VibePreferencesProps {
  isDarkMode: boolean;
  onBack: () => void;
}

interface AtmospherePreferences {
  energyLevel: number; // 1-10: Relaxed to Energetic
  socialSetting: number; // 1-10: Intimate to Social
  style: number; // 1-10: Classic to Trendy
  noiseLevel: number; // 1-10: Quiet to Loud
  crowdDensity: number; // 1-10: Spacious to Crowded
}

interface ExperiencePreferences {
  priceRange: [number, number]; // [$60, $2999]
  maxDistance: number; // 0.5 - 25 miles
  timeSlots: {
    morning: boolean;
    afternoon: boolean;
    evening: boolean;
  };
  groupSizes: {
    solo: boolean;
    couple: boolean;
    smallGroup: boolean;
    largeGroup: boolean;
  };
  dietary: string[]; // ['vegetarian', 'vegan', 'gluten-free', etc.]
  accessibility: string[]; // ['wheelchair', 'hearing', 'visual', etc.]
}

interface PersonalityAssessment {
  introvertExtrovert: number; // 1-10: Introvert to Extrovert
  discoveryStyle: 'explorer' | 'planner';
  answers: {
    q1: number; // Adventure vs Routine
    q2: number; // Spontaneous vs Planned
    q3: number; // Popular vs Hidden
    q4: number; // Fast-paced vs Slow-paced
    q5: number; // Diverse vs Consistent
  };
}

interface VibeSettings {
  atmosphere: AtmospherePreferences;
  experience: ExperiencePreferences;
  personality: PersonalityAssessment;
  isPremium: boolean;
  learningEnabled: boolean;
  seasonalAdjustments: boolean;
  socialInfluence: boolean;
}

type ViewMode = 'main' | 'personality-quiz';

export function VibePreferences({ isDarkMode, onBack }: VibePreferencesProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('main');
  const [quizStep, setQuizStep] = useState(0);
  
  const [settings, setSettings] = useState<VibeSettings>({
    atmosphere: {
      energyLevel: 7,
      socialSetting: 6,
      style: 7,
      noiseLevel: 5,
      crowdDensity: 5,
    },
    experience: {
      priceRange: [60, 250],
      maxDistance: 5,
      timeSlots: {
        morning: false,
        afternoon: true,
        evening: true,
      },
      groupSizes: {
        solo: true,
        couple: true,
        smallGroup: true,
        largeGroup: false,
      },
      dietary: [],
      accessibility: [],
    },
    personality: {
      introvertExtrovert: 6,
      discoveryStyle: 'explorer',
      answers: {
        q1: 5,
        q2: 5,
        q3: 5,
        q4: 5,
        q5: 5,
      },
    },
    isPremium: true, // Demo premium features
    learningEnabled: true,
    seasonalAdjustments: true,
    socialInfluence: false,
  });

  const springConfig = {
    type: "spring" as const,
    stiffness: 320,
    damping: 30,
    mass: 0.8,
  };

  const dietaryOptions = [
    { value: 'vegetarian', label: 'Vegetarian', icon: '🥗' },
    { value: 'vegan', label: 'Vegan', icon: '🌱' },
    { value: 'gluten-free', label: 'Gluten-Free', icon: '🌾' },
    { value: 'dairy-free', label: 'Dairy-Free', icon: '🥛' },
    { value: 'kosher', label: 'Kosher', icon: '✡️' },
    { value: 'halal', label: 'Halal', icon: '☪️' },
  ];

  const accessibilityOptions = [
    { value: 'wheelchair', label: 'Wheelchair Access', icon: '♿' },
    { value: 'hearing', label: 'Hearing Assistance', icon: '🦻' },
    { value: 'visual', label: 'Visual Assistance', icon: '👁️' },
    { value: 'service-animal', label: 'Service Animals', icon: '🐕‍🦺' },
  ];

  const personalityQuestions = [
    {
      question: "When planning an outing, I prefer...",
      leftLabel: "Familiar favorites",
      rightLabel: "New adventures",
      key: 'q1' as const,
    },
    {
      question: "My ideal evening is...",
      leftLabel: "Carefully planned",
      rightLabel: "Totally spontaneous",
      key: 'q2' as const,
    },
    {
      question: "I'm drawn to places that are...",
      leftLabel: "Hidden gems",
      rightLabel: "Popular hotspots",
      key: 'q3' as const,
    },
    {
      question: "I enjoy atmospheres that are...",
      leftLabel: "Calm & unhurried",
      rightLabel: "Fast-paced & lively",
      key: 'q4' as const,
    },
    {
      question: "When dining, I prefer...",
      leftLabel: "My go-to order",
      rightLabel: "Something different",
      key: 'q5' as const,
    },
  ];

  const vibeScore = useMemo(() => {
    const { atmosphere, personality } = settings;
    const avgAtmosphere = (
      atmosphere.energyLevel +
      atmosphere.socialSetting +
      atmosphere.style +
      atmosphere.noiseLevel +
      atmosphere.crowdDensity
    ) / 5;
    
    const avgPersonality = (
      personality.answers.q1 +
      personality.answers.q2 +
      personality.answers.q3 +
      personality.answers.q4 +
      personality.answers.q5
    ) / 5;
    
    return Math.round((avgAtmosphere + avgPersonality + personality.introvertExtrovert) / 3);
  }, [settings]);

  const vibeProfile = useMemo(() => {
    if (vibeScore <= 3) return { label: 'Zen Minimalist', color: 'from-blue-500 to-cyan-500', emoji: '🧘' };
    if (vibeScore <= 5) return { label: 'Balanced Explorer', color: 'from-green-500 to-emerald-500', emoji: '🌿' };
    if (vibeScore <= 7) return { label: 'Social Butterfly', color: 'from-purple-500 to-pink-500', emoji: '🦋' };
    return { label: 'Energy Seeker', color: 'from-orange-500 to-red-500', emoji: '⚡' };
  }, [vibeScore]);

  const handleSave = () => {
    localStorage.setItem('bytspot_vibe_preferences', JSON.stringify(settings));
    toast.success('Vibe preferences saved', {
      description: `Your ${vibeProfile.label} profile is ready!`,
    });
    setTimeout(() => onBack(), 1000);
  };

  const SliderControl = ({ 
    value, 
    onChange, 
    leftLabel, 
    rightLabel,
    leftIcon,
    rightIcon 
  }: { 
    value: number; 
    onChange: (val: number) => void;
    leftLabel: string;
    rightLabel: string;
    leftIcon?: React.ReactNode;
    rightIcon?: React.ReactNode;
  }) => (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-[13px]">
        <div className="flex items-center gap-2">
          {leftIcon}
          <span className="text-white/80" style={{ fontWeight: 500 }}>
            {leftLabel}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-white/80" style={{ fontWeight: 500 }}>
            {rightLabel}
          </span>
          {rightIcon}
        </div>
      </div>
      
      <div className="relative">
        <input
          type="range"
          min="1"
          max="10"
          value={value}
          onChange={(e) => onChange(parseInt(e.target.value))}
          className="w-full h-2 bg-white/20 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-7 [&::-webkit-slider-thumb]:h-7 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-gradient-to-br [&::-webkit-slider-thumb]:from-purple-500 [&::-webkit-slider-thumb]:to-pink-500 [&::-webkit-slider-thumb]:shadow-lg [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white/30"
        />
        <div className="flex justify-between mt-1 px-1">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
            <div 
              key={num} 
              className={`w-1 h-1 rounded-full transition-colors ${
                num <= value ? 'bg-gradient-to-r from-purple-500 to-pink-500' : 'bg-white/20'
              }`}
            />
          ))}
        </div>
      </div>
      
      <div className="text-center">
        <span className="text-[17px] text-white" style={{ fontWeight: 700 }}>
          {value}/10
        </span>
      </div>
    </div>
  );

  const DualRangeSlider = ({
    min,
    max,
    step,
    values,
    onChange,
    formatLabel,
  }: {
    min: number;
    max: number;
    step: number;
    values: [number, number];
    onChange: (values: [number, number]) => void;
    formatLabel: (val: number) => string;
  }) => {
    const [minVal, maxVal] = values;
    
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between text-[15px]">
          <span className="text-white" style={{ fontWeight: 600 }}>
            {formatLabel(minVal)}
          </span>
          <span className="text-white/60">to</span>
          <span className="text-white" style={{ fontWeight: 600 }}>
            {formatLabel(maxVal)}
          </span>
        </div>
        
        <div className="relative h-12 flex items-center">
          <div className="absolute w-full h-2 bg-white/20 rounded-full" />
          
          <div 
            className="absolute h-2 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full"
            style={{
              left: `${((minVal - min) / (max - min)) * 100}%`,
              right: `${100 - ((maxVal - min) / (max - min)) * 100}%`,
            }}
          />
          
          <input
            type="range"
            min={min}
            max={max}
            step={step}
            value={minVal}
            onChange={(e) => {
              const newMin = parseFloat(e.target.value);
              if (newMin < maxVal) {
                onChange([newMin, maxVal]);
              }
            }}
            className="absolute w-full appearance-none bg-transparent pointer-events-auto cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-7 [&::-webkit-slider-thumb]:h-7 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-lg [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-purple-500 [&::-webkit-slider-thumb]:pointer-events-auto"
          />
          
          <input
            type="range"
            min={min}
            max={max}
            step={step}
            value={maxVal}
            onChange={(e) => {
              const newMax = parseFloat(e.target.value);
              if (newMax > minVal) {
                onChange([minVal, newMax]);
              }
            }}
            className="absolute w-full appearance-none bg-transparent pointer-events-auto cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-7 [&::-webkit-slider-thumb]:h-7 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-lg [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-pink-500 [&::-webkit-slider-thumb]:pointer-events-auto"
          />
        </div>
      </div>
    );
  };

  // Personality Quiz View
  if (viewMode === 'personality-quiz') {
    const currentQuestion = personalityQuestions[quizStep];
    const isLastQuestion = quizStep === personalityQuestions.length - 1;
    
    return (
      <div className="h-full overflow-y-auto pb-24">
        <motion.div
          className="px-4 pt-4 pb-4 flex items-center gap-3 sticky top-0 bg-[#000000] z-10"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={springConfig}
        >
          <motion.button
            onClick={() => {
              if (quizStep > 0) {
                setQuizStep(quizStep - 1);
              } else {
                setViewMode('main');
              }
            }}
            className="w-10 h-10 rounded-full flex items-center justify-center bg-[#1C1C1E]/80 backdrop-blur-xl border-2 border-white/30 shadow-xl tap-target"
            whileTap={{ scale: 0.9 }}
            transition={springConfig}
          >
            <ArrowLeft className="w-5 h-5 text-white" strokeWidth={2.5} />
          </motion.button>
          <h1 className="text-title-2 text-white">
            Personality Assessment
          </h1>
        </motion.div>

        <div className="px-4 space-y-6">
          {/* Progress */}
          <motion.div
            className="rounded-[20px] p-4 border-2 border-white/30 bg-[#1C1C1E]/80 backdrop-blur-xl shadow-xl"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={springConfig}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-[13px] text-white/80" style={{ fontWeight: 500 }}>
                Question {quizStep + 1} of {personalityQuestions.length}
              </span>
              <span className="text-[13px] text-white" style={{ fontWeight: 600 }}>
                {Math.round(((quizStep + 1) / personalityQuestions.length) * 100)}%
              </span>
            </div>
            <div className="h-2 bg-white/20 rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-gradient-to-r from-purple-500 to-pink-500"
                initial={{ width: 0 }}
                animate={{ width: `${((quizStep + 1) / personalityQuestions.length) * 100}%` }}
                transition={springConfig}
              />
            </div>
          </motion.div>

          {/* Question Card */}
          <motion.div
            key={quizStep}
            className="rounded-[24px] p-8 border-2 border-white/30 bg-gradient-to-br from-purple-500/20 to-pink-500/20 backdrop-blur-xl shadow-xl"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={springConfig}
          >
            <div className="text-center mb-8">
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center mx-auto mb-4">
                <Brain className="w-8 h-8 text-white" strokeWidth={2.5} />
              </div>
              <h3 className="text-[20px] text-white mb-2" style={{ fontWeight: 600 }}>
                {currentQuestion.question}
              </h3>
            </div>

            <SliderControl
              value={settings.personality.answers[currentQuestion.key]}
              onChange={(val) => setSettings({
                ...settings,
                personality: {
                  ...settings.personality,
                  answers: {
                    ...settings.personality.answers,
                    [currentQuestion.key]: val,
                  },
                },
              })}
              leftLabel={currentQuestion.leftLabel}
              rightLabel={currentQuestion.rightLabel}
            />
          </motion.div>

          {/* Navigation */}
          <motion.button
            onClick={() => {
              if (isLastQuestion) {
                setViewMode('main');
                toast.success('Assessment complete!', {
                  description: 'Your vibe profile has been updated',
                });
              } else {
                setQuizStep(quizStep + 1);
              }
            }}
            className="w-full rounded-[20px] px-6 py-4 flex items-center justify-center gap-2 border-2 border-white/30 bg-gradient-to-br from-purple-500 to-pink-500 text-white shadow-xl"
            whileTap={{ scale: 0.98 }}
            transition={springConfig}
          >
            <span className="text-[17px]" style={{ fontWeight: 600 }}>
              {isLastQuestion ? 'Complete Assessment' : 'Next Question'}
            </span>
            <ChevronRight className="w-5 h-5" strokeWidth={2.5} />
          </motion.button>
        </div>
      </div>
    );
  }

  // Main View
  return (
    <div className="h-full overflow-y-auto pb-24">
      <motion.div
        className="px-4 pt-4 pb-4 flex items-center gap-3 sticky top-0 bg-[#000000] z-10"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={springConfig}
      >
        <motion.button
          onClick={onBack}
          className="w-10 h-10 rounded-full flex items-center justify-center bg-[#1C1C1E]/80 backdrop-blur-xl border-2 border-white/30 shadow-xl tap-target"
          whileTap={{ scale: 0.9 }}
          transition={springConfig}
        >
          <ArrowLeft className="w-5 h-5 text-white" strokeWidth={2.5} />
        </motion.button>
        <h1 className="text-title-2 text-white">
          Vibe Preferences
        </h1>
      </motion.div>

      <div className="px-4 space-y-6">
        {/* Vibe Profile Card */}
        <motion.div
          className="rounded-[24px] p-6 border-2 border-white/30 bg-[#1C1C1E]/80 backdrop-blur-xl shadow-xl"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...springConfig, delay: 0.1 }}
        >
          <div className="flex items-center gap-4 mb-4">
            <div className={`w-16 h-16 rounded-full bg-gradient-to-br ${vibeProfile.color} flex items-center justify-center text-[32px]`}>
              {vibeProfile.emoji}
            </div>
            <div className="flex-1">
              <h3 className="text-[20px] text-white mb-1" style={{ fontWeight: 700 }}>
                {vibeProfile.label}
              </h3>
              <p className="text-[15px] text-white/80" style={{ fontWeight: 400 }}>
                Vibe Score: {vibeScore}/10
              </p>
            </div>
            {settings.isPremium && (
              <div className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-gradient-to-r from-yellow-500/30 to-orange-500/30 border-2 border-yellow-400/50">
                <Crown className="w-4 h-4 text-yellow-400" strokeWidth={2.5} />
                <span className="text-[12px] text-yellow-200" style={{ fontWeight: 600 }}>
                  Premium
                </span>
              </div>
            )}
          </div>

          {settings.isPremium && (
            <div className="space-y-2 pt-4 border-t border-white/20">
              <div className="flex items-center justify-between text-[13px]">
                <span className="text-white/80" style={{ fontWeight: 500 }}>
                  AI Learning
                </span>
                <motion.button
                  onClick={() => setSettings({ ...settings, learningEnabled: !settings.learningEnabled })}
                  className={`w-[51px] h-[31px] rounded-full p-0.5 transition-colors ${
                    settings.learningEnabled ? 'bg-green-500' : 'bg-white/20'
                  }`}
                  whileTap={{ scale: 0.95 }}
                  transition={springConfig}
                >
                  <motion.div
                    className="w-[27px] h-[27px] rounded-full bg-white shadow-lg"
                    animate={{ x: settings.learningEnabled ? 20 : 0 }}
                    transition={springConfig}
                  />
                </motion.button>
              </div>

              <div className="flex items-center justify-between text-[13px]">
                <span className="text-white/80" style={{ fontWeight: 500 }}>
                  Seasonal Adjustments
                </span>
                <motion.button
                  onClick={() => setSettings({ ...settings, seasonalAdjustments: !settings.seasonalAdjustments })}
                  className={`w-[51px] h-[31px] rounded-full p-0.5 transition-colors ${
                    settings.seasonalAdjustments ? 'bg-green-500' : 'bg-white/20'
                  }`}
                  whileTap={{ scale: 0.95 }}
                  transition={springConfig}
                >
                  <motion.div
                    className="w-[27px] h-[27px] rounded-full bg-white shadow-lg"
                    animate={{ x: settings.seasonalAdjustments ? 20 : 0 }}
                    transition={springConfig}
                  />
                </motion.button>
              </div>

              <div className="flex items-center justify-between text-[13px]">
                <span className="text-white/80" style={{ fontWeight: 500 }}>
                  Social Influence
                </span>
                <motion.button
                  onClick={() => setSettings({ ...settings, socialInfluence: !settings.socialInfluence })}
                  className={`w-[51px] h-[31px] rounded-full p-0.5 transition-colors ${
                    settings.socialInfluence ? 'bg-green-500' : 'bg-white/20'
                  }`}
                  whileTap={{ scale: 0.95 }}
                  transition={springConfig}
                >
                  <motion.div
                    className="w-[27px] h-[27px] rounded-full bg-white shadow-lg"
                    animate={{ x: settings.socialInfluence ? 20 : 0 }}
                    transition={springConfig}
                  />
                </motion.button>
              </div>
            </div>
          )}
        </motion.div>

        {/* Atmosphere Preferences */}
        <motion.div
          className="rounded-[24px] p-6 border-2 border-white/30 bg-[#1C1C1E]/80 backdrop-blur-xl shadow-xl"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...springConfig, delay: 0.15 }}
        >
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-full flex items-center justify-center bg-gradient-to-br from-purple-500/40 to-pink-500/40 border-2 border-purple-400/30">
              <Sparkles className="w-5 h-5 text-white" strokeWidth={2.5} />
            </div>
            <h3 className="text-[17px] text-white" style={{ fontWeight: 600 }}>
              Atmosphere Preferences
            </h3>
          </div>

          <div className="space-y-6">
            <SliderControl
              value={settings.atmosphere.energyLevel}
              onChange={(val) => setSettings({
                ...settings,
                atmosphere: { ...settings.atmosphere, energyLevel: val }
              })}
              leftLabel="Relaxed"
              rightLabel="Energetic"
              leftIcon={<span className="text-[16px]">🧘</span>}
              rightIcon={<span className="text-[16px]">⚡</span>}
            />

            <div className="h-px bg-white/20" />

            <SliderControl
              value={settings.atmosphere.socialSetting}
              onChange={(val) => setSettings({
                ...settings,
                atmosphere: { ...settings.atmosphere, socialSetting: val }
              })}
              leftLabel="Intimate"
              rightLabel="Social"
              leftIcon={<span className="text-[16px]">💑</span>}
              rightIcon={<span className="text-[16px]">👥</span>}
            />

            <div className="h-px bg-white/20" />

            <SliderControl
              value={settings.atmosphere.style}
              onChange={(val) => setSettings({
                ...settings,
                atmosphere: { ...settings.atmosphere, style: val }
              })}
              leftLabel="Classic"
              rightLabel="Trendy"
              leftIcon={<span className="text-[16px]">🎩</span>}
              rightIcon={<span className="text-[16px]">✨</span>}
            />

            <div className="h-px bg-white/20" />

            <SliderControl
              value={settings.atmosphere.noiseLevel}
              onChange={(val) => setSettings({
                ...settings,
                atmosphere: { ...settings.atmosphere, noiseLevel: val }
              })}
              leftLabel="Quiet"
              rightLabel="Loud"
              leftIcon={<span className="text-[16px]">🤫</span>}
              rightIcon={<span className="text-[16px]">🔊</span>}
            />

            <div className="h-px bg-white/20" />

            <SliderControl
              value={settings.atmosphere.crowdDensity}
              onChange={(val) => setSettings({
                ...settings,
                atmosphere: { ...settings.atmosphere, crowdDensity: val }
              })}
              leftLabel="Spacious"
              rightLabel="Crowded"
              leftIcon={<span className="text-[16px]">🏞️</span>}
              rightIcon={<span className="text-[16px]">🎊</span>}
            />
          </div>
        </motion.div>

        {/* Experience Priorities */}
        <motion.div
          className="rounded-[24px] p-6 border-2 border-white/30 bg-[#1C1C1E]/80 backdrop-blur-xl shadow-xl"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...springConfig, delay: 0.2 }}
        >
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-full flex items-center justify-center bg-gradient-to-br from-blue-500/40 to-cyan-500/40 border-2 border-blue-400/30">
              <TrendingUp className="w-5 h-5 text-white" strokeWidth={2.5} />
            </div>
            <h3 className="text-[17px] text-white" style={{ fontWeight: 600 }}>
              Experience Priorities
            </h3>
          </div>

          <div className="space-y-6">
            {/* Price Range */}
            <div>
              <div className="flex items-center gap-2 mb-4">
                <DollarSign className="w-5 h-5 text-white/60" strokeWidth={2} />
                <h4 className="text-[15px] text-white" style={{ fontWeight: 600 }}>
                  Price Range
                </h4>
              </div>
              <DualRangeSlider
                min={60}
                max={2999}
                step={10}
                values={settings.experience.priceRange}
                onChange={(values) => setSettings({
                  ...settings,
                  experience: { ...settings.experience, priceRange: values }
                })}
                formatLabel={(val) => `$${val}`}
              />
            </div>

            <div className="h-px bg-white/20" />

            {/* Max Distance */}
            <div>
              <div className="flex items-center gap-2 mb-4">
                <MapPin className="w-5 h-5 text-white/60" strokeWidth={2} />
                <h4 className="text-[15px] text-white" style={{ fontWeight: 600 }}>
                  Maximum Travel Distance
                </h4>
              </div>
              <input
                type="range"
                min="0.5"
                max="25"
                step="0.5"
                value={settings.experience.maxDistance}
                onChange={(e) => setSettings({
                  ...settings,
                  experience: { ...settings.experience, maxDistance: parseFloat(e.target.value) }
                })}
                className="w-full h-2 bg-white/20 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-7 [&::-webkit-slider-thumb]:h-7 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-gradient-to-br [&::-webkit-slider-thumb]:from-blue-500 [&::-webkit-slider-thumb]:to-cyan-500 [&::-webkit-slider-thumb]:shadow-lg [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white/30"
              />
              <div className="text-center mt-2">
                <span className="text-[17px] text-white" style={{ fontWeight: 700 }}>
                  {settings.experience.maxDistance} miles
                </span>
              </div>
            </div>

            <div className="h-px bg-white/20" />

            {/* Time Slots */}
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Clock className="w-5 h-5 text-white/60" strokeWidth={2} />
                <h4 className="text-[15px] text-white" style={{ fontWeight: 600 }}>
                  Preferred Time Slots
                </h4>
              </div>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { key: 'morning' as const, label: 'Morning', icon: '🌅' },
                  { key: 'afternoon' as const, label: 'Afternoon', icon: '☀️' },
                  { key: 'evening' as const, label: 'Evening', icon: '🌙' },
                ].map((slot) => (
                  <motion.button
                    key={slot.key}
                    onClick={() => setSettings({
                      ...settings,
                      experience: {
                        ...settings.experience,
                        timeSlots: {
                          ...settings.experience.timeSlots,
                          [slot.key]: !settings.experience.timeSlots[slot.key],
                        },
                      },
                    })}
                    className={`rounded-[16px] p-3 border-2 ${
                      settings.experience.timeSlots[slot.key]
                        ? 'bg-gradient-to-br from-purple-500/40 to-pink-500/40 border-purple-400/50'
                        : 'bg-white/5 border-white/30'
                    }`}
                    whileTap={{ scale: 0.95 }}
                    transition={springConfig}
                  >
                    <div className="text-[20px] mb-1">{slot.icon}</div>
                    <div className="text-[13px] text-white" style={{ fontWeight: 600 }}>
                      {slot.label}
                    </div>
                  </motion.button>
                ))}
              </div>
            </div>

            <div className="h-px bg-white/20" />

            {/* Group Size */}
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Users className="w-5 h-5 text-white/60" strokeWidth={2} />
                <h4 className="text-[15px] text-white" style={{ fontWeight: 600 }}>
                  Group Size Preferences
                </h4>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { key: 'solo' as const, label: 'Solo', icon: '👤' },
                  { key: 'couple' as const, label: 'Couple', icon: '👫' },
                  { key: 'smallGroup' as const, label: 'Small Group', icon: '👥' },
                  { key: 'largeGroup' as const, label: 'Large Group', icon: '👨‍👩‍👧‍👦' },
                ].map((size) => (
                  <motion.button
                    key={size.key}
                    onClick={() => setSettings({
                      ...settings,
                      experience: {
                        ...settings.experience,
                        groupSizes: {
                          ...settings.experience.groupSizes,
                          [size.key]: !settings.experience.groupSizes[size.key],
                        },
                      },
                    })}
                    className={`rounded-[16px] p-3 border-2 ${
                      settings.experience.groupSizes[size.key]
                        ? 'bg-gradient-to-br from-green-500/40 to-emerald-500/40 border-green-400/50'
                        : 'bg-white/5 border-white/30'
                    }`}
                    whileTap={{ scale: 0.95 }}
                    transition={springConfig}
                  >
                    <div className="text-[20px] mb-1">{size.icon}</div>
                    <div className="text-[13px] text-white" style={{ fontWeight: 600 }}>
                      {size.label}
                    </div>
                  </motion.button>
                ))}
              </div>
            </div>

            <div className="h-px bg-white/20" />

            {/* Dietary Restrictions */}
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Utensils className="w-5 h-5 text-white/60" strokeWidth={2} />
                <h4 className="text-[15px] text-white" style={{ fontWeight: 600 }}>
                  Dietary Restrictions
                </h4>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {dietaryOptions.map((option) => (
                  <motion.button
                    key={option.value}
                    onClick={() => {
                      const newDietary = settings.experience.dietary.includes(option.value)
                        ? settings.experience.dietary.filter(d => d !== option.value)
                        : [...settings.experience.dietary, option.value];
                      setSettings({
                        ...settings,
                        experience: { ...settings.experience, dietary: newDietary },
                      });
                    }}
                    className={`rounded-[16px] p-3 border-2 flex items-center gap-2 ${
                      settings.experience.dietary.includes(option.value)
                        ? 'bg-gradient-to-br from-orange-500/40 to-amber-500/40 border-orange-400/50'
                        : 'bg-white/5 border-white/30'
                    }`}
                    whileTap={{ scale: 0.95 }}
                    transition={springConfig}
                  >
                    <span className="text-[16px]">{option.icon}</span>
                    <span className="text-[13px] text-white" style={{ fontWeight: 600 }}>
                      {option.label}
                    </span>
                  </motion.button>
                ))}
              </div>
            </div>

            <div className="h-px bg-white/20" />

            {/* Accessibility */}
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Heart className="w-5 h-5 text-white/60" strokeWidth={2} />
                <h4 className="text-[15px] text-white" style={{ fontWeight: 600 }}>
                  Accessibility Needs
                </h4>
              </div>
              <div className="grid grid-cols-1 gap-3">
                {accessibilityOptions.map((option) => (
                  <motion.button
                    key={option.value}
                    onClick={() => {
                      const newAccessibility = settings.experience.accessibility.includes(option.value)
                        ? settings.experience.accessibility.filter(a => a !== option.value)
                        : [...settings.experience.accessibility, option.value];
                      setSettings({
                        ...settings,
                        experience: { ...settings.experience, accessibility: newAccessibility },
                      });
                    }}
                    className={`rounded-[16px] p-3 border-2 flex items-center gap-3 ${
                      settings.experience.accessibility.includes(option.value)
                        ? 'bg-gradient-to-br from-pink-500/40 to-rose-500/40 border-pink-400/50'
                        : 'bg-white/5 border-white/30'
                    }`}
                    whileTap={{ scale: 0.95 }}
                    transition={springConfig}
                  >
                    <span className="text-[20px]">{option.icon}</span>
                    <span className="text-[15px] text-white flex-1 text-left" style={{ fontWeight: 600 }}>
                      {option.label}
                    </span>
                    {settings.experience.accessibility.includes(option.value) && (
                      <Check className="w-5 h-5 text-white" strokeWidth={3} />
                    )}
                  </motion.button>
                ))}
              </div>
            </div>
          </div>
        </motion.div>

        {/* AI Matching Configuration */}
        <motion.div
          className="rounded-[24px] p-6 border-2 border-white/30 bg-[#1C1C1E]/80 backdrop-blur-xl shadow-xl"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...springConfig, delay: 0.25 }}
        >
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-full flex items-center justify-center bg-gradient-to-br from-pink-500/40 to-purple-500/40 border-2 border-pink-400/30">
              <Brain className="w-5 h-5 text-white" strokeWidth={2.5} />
            </div>
            <h3 className="text-[17px] text-white" style={{ fontWeight: 600 }}>
              AI Matching
            </h3>
          </div>

          <div className="space-y-6">
            {/* Personality Assessment Button */}
            <motion.button
              onClick={() => {
                setQuizStep(0);
                setViewMode('personality-quiz');
              }}
              className="w-full rounded-[16px] p-4 border-2 border-purple-500/50 bg-gradient-to-br from-purple-500/30 to-pink-500/30 flex items-center justify-between"
              whileTap={{ scale: 0.98 }}
              transition={springConfig}
            >
              <div className="flex items-center gap-3">
                <Brain className="w-6 h-6 text-white" strokeWidth={2.5} />
                <div className="text-left">
                  <div className="text-[15px] text-white mb-0.5" style={{ fontWeight: 600 }}>
                    Personality Assessment
                  </div>
                  <div className="text-[13px] text-white/80" style={{ fontWeight: 400 }}>
                    5 questions • 2 min
                  </div>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-white" strokeWidth={2.5} />
            </motion.button>

            <div className="h-px bg-white/20" />

            {/* Social Interaction Scale */}
            <div>
              <h4 className="text-[15px] text-white mb-4" style={{ fontWeight: 600 }}>
                Social Interaction Preference
              </h4>
              <SliderControl
                value={settings.personality.introvertExtrovert}
                onChange={(val) => setSettings({
                  ...settings,
                  personality: { ...settings.personality, introvertExtrovert: val }
                })}
                leftLabel="Introvert"
                rightLabel="Extrovert"
                leftIcon={<span className="text-[16px]">🤫</span>}
                rightIcon={<span className="text-[16px]">🎉</span>}
              />
            </div>

            <div className="h-px bg-white/20" />

            {/* Discovery Style */}
            <div>
              <h4 className="text-[15px] text-white mb-4" style={{ fontWeight: 600 }}>
                Discovery Style
              </h4>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { value: 'explorer' as const, label: 'Explorer', icon: '🧭', desc: 'Spontaneous & adventurous' },
                  { value: 'planner' as const, label: 'Planner', icon: '📋', desc: 'Organized & prepared' },
                ].map((style) => (
                  <motion.button
                    key={style.value}
                    onClick={() => setSettings({
                      ...settings,
                      personality: { ...settings.personality, discoveryStyle: style.value }
                    })}
                    className={`rounded-[16px] p-4 border-2 ${
                      settings.personality.discoveryStyle === style.value
                        ? 'bg-gradient-to-br from-blue-500/40 to-cyan-500/40 border-blue-400/50'
                        : 'bg-white/5 border-white/30'
                    }`}
                    whileTap={{ scale: 0.95 }}
                    transition={springConfig}
                  >
                    <div className="text-[24px] mb-2">{style.icon}</div>
                    <div className="text-[15px] text-white mb-1" style={{ fontWeight: 600 }}>
                      {style.label}
                    </div>
                    <div className="text-[12px] text-white/60" style={{ fontWeight: 400 }}>
                      {style.desc}
                    </div>
                  </motion.button>
                ))}
              </div>
            </div>
          </div>
        </motion.div>

        {/* Save Button */}
        <motion.button
          onClick={handleSave}
          className="w-full rounded-[20px] px-6 py-4 flex items-center justify-center gap-2 border-2 border-white/30 bg-gradient-to-br from-purple-500 to-pink-500 text-white shadow-xl"
          whileTap={{ scale: 0.98 }}
          transition={springConfig}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <Save className="w-5 h-5" strokeWidth={2.5} />
          <span className="text-[17px]" style={{ fontWeight: 600 }}>
            Save Vibe Preferences
          </span>
        </motion.button>
      </div>
    </div>
  );
}
