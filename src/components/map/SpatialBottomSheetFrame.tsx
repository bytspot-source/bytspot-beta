import { motion, AnimatePresence } from 'motion/react';
import type { ReactNode } from 'react';

type SpatialBottomSheetFrameProps = {
  isVisible: boolean;
  isExpanded: boolean;
  isVerified: boolean;
  peekY: number;
  snapOffset: number;
  snapVelocity: number;
  onExpandedChange: (next: boolean | ((current: boolean) => boolean)) => void;
  children: ReactNode;
};

export function SpatialBottomSheetFrame({
  isVisible,
  isExpanded,
  isVerified,
  peekY,
  snapOffset,
  snapVelocity,
  onExpandedChange,
  children,
}: SpatialBottomSheetFrameProps) {
  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          className="absolute bottom-20 left-3 right-3 z-[1002]"
          data-testid="spatial-intelligence-sheet"
          initial={{ y: peekY, opacity: 0 }}
          animate={{ y: isExpanded ? 0 : peekY, opacity: 1 }}
          exit={{ y: 180, opacity: 0 }}
          drag="y"
          dragConstraints={{ top: 0, bottom: peekY }}
          dragElastic={0.06}
          dragMomentum={false}
          onDragEnd={(_, info) => {
            const shouldExpand = info.velocity.y < -snapVelocity || info.offset.y < -snapOffset;
            const shouldCollapse = info.velocity.y > snapVelocity || info.offset.y > snapOffset;
            onExpandedChange(current => shouldExpand ? true : shouldCollapse ? false : current);
          }}
          transition={{ type: 'spring', stiffness: 420, damping: 38, mass: 0.82 }}
        >
          <div
            className={`max-h-[72vh] overflow-hidden rounded-[28px] border bg-[#050505] shadow-2xl ${isVerified ? 'border-cyan-400/55' : 'border-white/35'}`}
            data-testid="spatial-sheet-surface"
            style={isVerified ? { boxShadow: '0 0 34px rgba(34,211,238,0.16), 0 18px 42px rgba(0,0,0,0.48)' } : undefined}
          >
            <button
              className="mx-auto mt-3 block h-1.5 w-12 rounded-full bg-white/70"
              data-testid="spatial-sheet-toggle"
              onClick={() => onExpandedChange(previous => !previous)}
              aria-label="Toggle map results sheet"
            />
            <div className="max-h-[68vh] overflow-y-auto px-4 pb-4 pt-3 scrollbar-hide">
              {children}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}