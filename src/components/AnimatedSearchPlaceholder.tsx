import { motion, AnimatePresence } from 'motion/react';
import { useState, useEffect } from 'react';

interface AnimatedSearchPlaceholderProps {
  isDarkMode: boolean;
}

const searchSuggestions = [
  'restaurants',
  'premium parking',
  'dinner spots',
  'valet service',
  'shopping malls',
  'event venues',
  'airports',
  'hotels',
  'coffee shops',
];

export function AnimatedSearchPlaceholder({ isDarkMode }: AnimatedSearchPlaceholderProps) {
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % searchSuggestions.length);
    }, 2500);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex items-center gap-1 pointer-events-none text-[15px]">
      <span className={`transition-colors ${isDarkMode ? 'text-white/55' : 'text-black/55'}`}>
        Search for
      </span>
      <div className="relative min-w-[110px]">
        <AnimatePresence mode="wait">
          <motion.span
            key={currentIndex}
            initial={{ y: 8, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -8, opacity: 0 }}
            transition={{
              duration: 0.3,
              ease: [0.16, 1, 0.3, 1],
            }}
            className={`absolute left-0 whitespace-nowrap transition-colors ${
              isDarkMode ? 'text-white/55' : 'text-black/55'
            }`}
          >
            {searchSuggestions[currentIndex]}
          </motion.span>
        </AnimatePresence>
      </div>
      <span className={`transition-colors ${isDarkMode ? 'text-white/55' : 'text-black/55'}`}>
        ...
      </span>
    </div>
  );
}
