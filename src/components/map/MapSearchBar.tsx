import { motion, AnimatePresence } from 'motion/react';
import { Search } from 'lucide-react';

type MapSearchBarProps = {
  isVisible: boolean;
  isFocusedMapMode: boolean;
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  transition: object;
};

export function MapSearchBar({ isVisible, isFocusedMapMode, value, onChange, onSubmit, transition }: MapSearchBarProps) {
  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          className="absolute left-3 right-20 top-4 z-[1000]"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: isFocusedMapMode ? 0.92 : 1, y: 0, scale: isFocusedMapMode ? 0.98 : 1 }}
          exit={{ opacity: 0, y: -10 }}
          transition={transition}
        >
          <div className={`rounded-[24px] border border-white/35 bg-[#080A10] px-3 shadow-2xl ${isFocusedMapMode ? 'py-2.5' : 'py-3'}`}>
            <div className="flex items-center gap-3">
              <Search className="h-5 w-5 flex-shrink-0 text-cyan-200" strokeWidth={2.5} />
              <input
                value={value}
                onChange={(event) => onChange(event.target.value)}
                onKeyDown={(event) => {
                  const query = event.currentTarget.value.trim();
                  if (event.key === 'Enter' && query) onSubmit(query);
                }}
                placeholder="Search destination or service type"
                className="min-w-0 flex-1 bg-transparent text-[15px] text-white outline-none placeholder:text-white/45"
                style={{ fontWeight: 700 }}
              />
              <div className="hidden rounded-full border border-cyan-400/50 bg-[#06242B] px-2.5 py-1 text-[10px] uppercase tracking-[0.14em] text-cyan-100 sm:block" style={{ fontWeight: 900 }}>
                Station Mode
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}