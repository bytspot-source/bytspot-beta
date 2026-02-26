import { motion, AnimatePresence } from 'motion/react';
import { Search, Mic, MapPin, Clock, TrendingUp, X, Navigation } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { AnimatedSearchPlaceholder } from './AnimatedSearchPlaceholder';

interface SearchSuggestion {
  id: string;
  text: string;
  type: 'recent' | 'trending' | 'nearby' | 'category';
  icon: React.ReactNode;
  category?: string;
}

interface SmartSearchBarProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onSuggestionClick: (suggestion: SearchSuggestion) => void;
  isDarkMode: boolean;
}

export function SmartSearchBar({ 
  value, 
  onChange, 
  onSubmit, 
  onSuggestionClick,
  isDarkMode 
}: SmartSearchBarProps) {
  const [isFocused, setIsFocused] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const springConfig = {
    type: "spring" as const,
    stiffness: 320,
    damping: 30,
    mass: 0.8,
  };

  // Get recent searches from localStorage
  const getRecentSearches = (): SearchSuggestion[] => {
    const recent = localStorage.getItem('bytspot_recent_searches');
    if (!recent) return [];
    
    try {
      const parsed = JSON.parse(recent);
      return parsed.slice(0, 3).map((text: string, index: number) => ({
        id: `recent-${index}`,
        text,
        type: 'recent' as const,
        icon: <Clock className="w-4 h-4 text-white/60" strokeWidth={2} />,
      }));
    } catch {
      return [];
    }
  };

  // Trending searches
  const trendingSearches: SearchSuggestion[] = [
    {
      id: 'trend-1',
      text: 'Downtown parking',
      type: 'trending',
      icon: <TrendingUp className="w-4 h-4 text-[#FF4500]" strokeWidth={2.5} />,
      category: 'parking',
    },
    {
      id: 'trend-2',
      text: 'Coffee shops nearby',
      type: 'trending',
      icon: <TrendingUp className="w-4 h-4 text-[#FF4500]" strokeWidth={2.5} />,
      category: 'coffee',
    },
    {
      id: 'trend-3',
      text: 'Nightlife venues',
      type: 'trending',
      icon: <TrendingUp className="w-4 h-4 text-[#FF4500]" strokeWidth={2.5} />,
      category: 'nightlife',
    },
  ];

  // Nearby suggestions
  const nearbySuggestions: SearchSuggestion[] = [
    {
      id: 'nearby-1',
      text: 'Union Square',
      type: 'nearby',
      icon: <MapPin className="w-4 h-4 text-[#00BFFF]" strokeWidth={2.5} />,
    },
    {
      id: 'nearby-2',
      text: 'Ferry Building',
      type: 'nearby',
      icon: <MapPin className="w-4 h-4 text-[#00BFFF]" strokeWidth={2.5} />,
    },
  ];

  // All suggestions
  const allSuggestions = [
    ...getRecentSearches(),
    ...trendingSearches,
    ...nearbySuggestions,
  ];

  // Filter suggestions based on input
  const filteredSuggestions = value.trim() 
    ? allSuggestions.filter(s => 
        s.text.toLowerCase().includes(value.toLowerCase())
      )
    : allSuggestions;

  // Show suggestions when focused and have suggestions
  useEffect(() => {
    setShowSuggestions(isFocused && filteredSuggestions.length > 0);
  }, [isFocused, filteredSuggestions.length]);

  // Handle voice input (mock)
  const handleVoiceInput = () => {
    setIsListening(true);
    
    // Simulate voice recognition
    setTimeout(() => {
      setIsListening(false);
      onChange('Coffee shops nearby');
      inputRef.current?.focus();
    }, 2000);
  };

  // Clear search
  const handleClear = () => {
    onChange('');
    inputRef.current?.focus();
  };

  return (
    <motion.div 
      className="relative"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...springConfig, delay: 0.35 }}
    >
      <form onSubmit={onSubmit}>
        <motion.div
          className="relative"
          animate={{
            scale: isFocused ? 1.01 : 1,
          }}
          transition={springConfig}
        >
          {/* Search Input */}
          <div className="relative rounded-[20px] overflow-hidden border-2 border-white/30 shadow-2xl bg-[#1C1C1E]/85 backdrop-blur-xl">
            <div className="flex items-center gap-3 px-4 py-3">
              {/* Search Icon */}
              <motion.div
                animate={{
                  scale: isFocused ? 1.1 : 1,
                  rotate: isFocused ? 15 : 0,
                }}
                transition={springConfig}
              >
                <Search className="w-[18px] h-[18px] flex-shrink-0 text-white/90" strokeWidth={2.5} />
              </motion.div>
              
              {/* Input Field */}
              <div className="flex-1 relative min-h-[20px]">
                {value === '' && !isFocused && (
                  <AnimatedSearchPlaceholder isDarkMode={isDarkMode} />
                )}
                <input
                  ref={inputRef}
                  type="text"
                  value={value}
                  onChange={(e) => onChange(e.target.value)}
                  onFocus={() => setIsFocused(true)}
                  onBlur={() => {
                    // Delay to allow suggestion clicks
                    setTimeout(() => setIsFocused(false), 200);
                  }}
                  className={`w-full bg-transparent text-[16px] outline-none text-white placeholder:text-white/50 ${
                    value === '' && !isFocused ? 'opacity-0' : 'opacity-100'
                  }`}
                  style={{ fontWeight: 500 }}
                  placeholder="Search or ask me anything..."
                />
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2">
                {/* Clear Button */}
                <AnimatePresence>
                  {value && (
                    <motion.button
                      type="button"
                      onClick={handleClear}
                      className="w-7 h-7 rounded-full flex items-center justify-center bg-white/10 hover:bg-white/20"
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0, opacity: 0 }}
                      whileTap={{ scale: 0.9 }}
                      transition={springConfig}
                    >
                      <X className="w-4 h-4 text-white/80" strokeWidth={2.5} />
                    </motion.button>
                  )}
                </AnimatePresence>

                {/* Voice Button */}
                <motion.button
                  type="button"
                  onClick={handleVoiceInput}
                  className={`w-9 h-9 rounded-full flex items-center justify-center tap-target ${
                    isListening 
                      ? 'bg-gradient-to-br from-red-500 to-pink-500' 
                      : 'bg-gradient-to-br from-[#A855F7]/50 to-[#D946EF]/50'
                  }`}
                  whileTap={{ scale: 0.85 }}
                  animate={isListening ? {
                    scale: [1, 1.1, 1],
                  } : {}}
                  transition={isListening ? {
                    duration: 1,
                    repeat: Infinity,
                    ease: "easeInOut",
                  } : springConfig}
                >
                  <Mic className={`w-[18px] h-[18px] ${
                    isListening ? 'text-white' : 'text-[#E879F9]'
                  }`} strokeWidth={2.5} />
                </motion.button>
              </div>
            </div>

            {/* Listening Indicator */}
            <AnimatePresence>
              {isListening && (
                <motion.div
                  className="absolute inset-x-0 bottom-0 h-1 bg-gradient-to-r from-red-500 via-pink-500 to-purple-500"
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: 1 }}
                  exit={{ scaleX: 0 }}
                  transition={{ duration: 2 }}
                  style={{ transformOrigin: 'left' }}
                />
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      </form>

      {/* Search Suggestions Dropdown */}
      <AnimatePresence>
        {showSuggestions && (
          <motion.div
            className="absolute top-full left-0 right-0 mt-2 rounded-[20px] overflow-hidden border-2 border-white/30 shadow-2xl bg-[#1C1C1E]/95 backdrop-blur-xl z-50 max-h-[320px] overflow-y-auto"
            initial={{ opacity: 0, y: -10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            transition={springConfig}
          >
            <div className="p-2">
              {/* Recent Searches Section */}
              {getRecentSearches().length > 0 && !value && (
                <>
                  <div className="px-3 py-2 flex items-center justify-between">
                    <span className="text-[11px] text-white/50" style={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      Recent
                    </span>
                    <button
                      onClick={() => {
                        localStorage.removeItem('bytspot_recent_searches');
                        setShowSuggestions(false);
                      }}
                      className="text-[11px] text-[#A855F7]"
                      style={{ fontWeight: 600 }}
                    >
                      Clear
                    </button>
                  </div>
                  {getRecentSearches().map((suggestion, index) => (
                    <SuggestionItem
                      key={suggestion.id}
                      suggestion={suggestion}
                      onClick={() => {
                        onSuggestionClick(suggestion);
                        setShowSuggestions(false);
                      }}
                      delay={index * 0.03}
                    />
                  ))}
                  <div className="h-px bg-white/10 my-2" />
                </>
              )}

              {/* Trending Section */}
              {trendingSearches.some(s => 
                !value || s.text.toLowerCase().includes(value.toLowerCase())
              ) && (
                <>
                  <div className="px-3 py-2">
                    <span className="text-[11px] text-white/50" style={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      Trending Now
                    </span>
                  </div>
                  {trendingSearches
                    .filter(s => !value || s.text.toLowerCase().includes(value.toLowerCase()))
                    .map((suggestion, index) => (
                      <SuggestionItem
                        key={suggestion.id}
                        suggestion={suggestion}
                        onClick={() => {
                          onSuggestionClick(suggestion);
                          setShowSuggestions(false);
                        }}
                        delay={index * 0.03}
                      />
                    ))}
                  <div className="h-px bg-white/10 my-2" />
                </>
              )}

              {/* Nearby Section */}
              {nearbySuggestions.some(s => 
                !value || s.text.toLowerCase().includes(value.toLowerCase())
              ) && (
                <>
                  <div className="px-3 py-2">
                    <span className="text-[11px] text-white/50" style={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      Nearby Places
                    </span>
                  </div>
                  {nearbySuggestions
                    .filter(s => !value || s.text.toLowerCase().includes(value.toLowerCase()))
                    .map((suggestion, index) => (
                      <SuggestionItem
                        key={suggestion.id}
                        suggestion={suggestion}
                        onClick={() => {
                          onSuggestionClick(suggestion);
                          setShowSuggestions(false);
                        }}
                        delay={index * 0.03}
                      />
                    ))}
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Voice Listening Overlay */}
      <AnimatePresence>
        {isListening && (
          <motion.div
            className="fixed inset-0 bg-black/60 backdrop-blur-md z-40 flex items-center justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="text-center"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
            >
              <motion.div
                className="w-24 h-24 mx-auto mb-6 rounded-full bg-gradient-to-br from-red-500 to-pink-500 flex items-center justify-center"
                animate={{
                  scale: [1, 1.2, 1],
                }}
                transition={{
                  duration: 1,
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
              >
                <Mic className="w-12 h-12 text-white" strokeWidth={2} />
              </motion.div>
              <p className="text-white text-[20px] mb-2" style={{ fontWeight: 600 }}>
                Listening...
              </p>
              <p className="text-white/70 text-[15px]" style={{ fontWeight: 400 }}>
                Try saying "Find parking near me"
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// Suggestion Item Component
function SuggestionItem({ 
  suggestion, 
  onClick, 
  delay 
}: { 
  suggestion: SearchSuggestion; 
  onClick: () => void; 
  delay: number;
}) {
  return (
    <motion.button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-[12px] hover:bg-white/10 transition-colors text-left"
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay }}
      whileTap={{ scale: 0.98 }}
    >
      <div className="flex-shrink-0">
        {suggestion.icon}
      </div>
      <span className="flex-1 text-[15px] text-white" style={{ fontWeight: 500 }}>
        {suggestion.text}
      </span>
      <Navigation className="w-4 h-4 text-white/40 flex-shrink-0" strokeWidth={2} />
    </motion.button>
  );
}
