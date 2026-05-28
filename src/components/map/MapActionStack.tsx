import { motion } from 'motion/react';
import { Crosshair, Layers, Minus, Plus, Zap } from 'lucide-react';

type MapActionStackProps = {
  mapMode: string;
  hideRightActionStack: boolean;
  showLayerButton: boolean;
  showLayerMenu: boolean;
  showFullRightActionStack: boolean;
  showTrafficIntel: boolean;
  showVerifiedOnly: boolean;
  onToggleLayers: (event: React.MouseEvent<HTMLButtonElement>) => void;
  onRecenter: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onToggleTraffic: (event: React.MouseEvent<HTMLButtonElement>) => void;
  onShowPartneredVendors: (event: React.MouseEvent<HTMLButtonElement>) => void;
  transition: object;
};

export function MapActionStack({
  mapMode,
  hideRightActionStack,
  showLayerButton,
  showLayerMenu,
  showFullRightActionStack,
  showTrafficIntel,
  showVerifiedOnly,
  onToggleLayers,
  onRecenter,
  onZoomIn,
  onZoomOut,
  onToggleTraffic,
  onShowPartneredVendors,
  transition,
}: MapActionStackProps) {
  return (
    <motion.div
      className={`absolute top-28 right-4 flex flex-col gap-2 ${mapMode === 'navigation' ? 'z-[1006]' : 'z-[1000]'}`}
      data-testid="map-right-action-stack"
      animate={hideRightActionStack ? { opacity: 0, x: 28, scale: 0.96 } : { opacity: 1, x: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 340, damping: 32, mass: 0.85 }}
      style={{ pointerEvents: hideRightActionStack ? 'none' : 'auto', zIndex: mapMode === 'navigation' ? 1006 : 1000 }}
      aria-hidden={hideRightActionStack}
    >
      {showLayerButton && (
        <motion.button
          onClick={onToggleLayers}
          className={`w-12 h-12 rounded-full flex items-center justify-center border-2 shadow-xl transition-colors ${showLayerMenu ? 'bg-cyan-500 border-cyan-100' : 'bg-[#050505] border-white/40'}`}
          whileTap={{ scale: 0.9 }}
          transition={transition}
          aria-label="Map layers"
          aria-expanded={showLayerMenu}
        >
          <Layers className="w-5 h-5 text-white" strokeWidth={2.5} />
        </motion.button>
      )}
      {!showLayerMenu && (
        <motion.button onClick={onRecenter} className="w-12 h-12 rounded-full flex items-center justify-center bg-[#050505] border-2 border-white/40 shadow-xl" whileTap={{ scale: 0.9 }} transition={transition} aria-label="Current location">
          <Crosshair className="w-5 h-5 text-white" strokeWidth={2.5} />
        </motion.button>
      )}
      {showFullRightActionStack && (
        <>
          <motion.button onClick={onZoomIn} className="w-11 h-11 rounded-full flex items-center justify-center bg-[#050505] border-2 border-white/40 shadow-xl" whileTap={{ scale: 0.9 }} transition={transition}>
            <Plus className="w-5 h-5 text-white" strokeWidth={2.5} />
          </motion.button>
          <motion.button onClick={onZoomOut} className="w-11 h-11 rounded-full flex items-center justify-center bg-[#050505] border-2 border-white/40 shadow-xl" whileTap={{ scale: 0.9 }} transition={transition}>
            <Minus className="w-5 h-5 text-white" strokeWidth={2.5} />
          </motion.button>
          <motion.button
            onClick={onToggleTraffic}
            className={`w-11 h-11 rounded-full flex items-center justify-center border-2 shadow-xl transition-colors ${showTrafficIntel ? 'bg-amber-500 border-amber-200' : 'bg-[#050505] border-white/40'}`}
            whileTap={{ scale: 0.9 }}
            transition={transition}
            title="Traffic Intelligence"
            aria-label="Traffic intelligence"
            data-testid="traffic-intelligence-fab"
          >
            <Zap className={`w-5 h-5 ${showTrafficIntel ? 'text-white' : 'text-amber-400'}`} strokeWidth={2.5} />
          </motion.button>
          <motion.button
            onClick={onShowPartneredVendors}
            className="relative w-11 h-11 flex items-center justify-center"
            whileTap={{ scale: 0.9 }}
            transition={transition}
            aria-pressed={showVerifiedOnly}
            aria-label="Show partnered Tap Zone providers"
            data-testid="partnered-vendors-patch-button"
            title="Partnered Tap Zone providers"
          >
            {showVerifiedOnly && (
              <motion.span className="absolute inset-0 rounded-full" style={{ background: 'radial-gradient(circle, rgba(34,211,238,0.55), rgba(124,58,237,0.25) 60%, transparent 75%)' }} animate={{ scale: [1, 1.55, 1.85], opacity: [0.65, 0.15, 0] }} transition={{ duration: 1.6, repeat: Infinity, ease: 'easeOut' }} />
            )}
            <motion.span
              className="absolute inset-0 flex items-center justify-center border-2 shadow-xl"
              style={{
                clipPath: 'polygon(25% 6%, 75% 6%, 100% 50%, 75% 94%, 25% 94%, 0 50%)',
                background: showVerifiedOnly ? 'linear-gradient(135deg, rgba(6,182,212,0.96), rgba(124,58,237,0.96) 58%, rgba(236,72,153,0.95))' : '#050505',
                borderColor: showVerifiedOnly ? 'rgba(165,243,252,1)' : 'rgba(255,255,255,0.42)',
              }}
              animate={showVerifiedOnly ? { scale: [1, 1.04, 1] } : { scale: 1 }}
              transition={{ duration: 2.4, repeat: showVerifiedOnly ? Infinity : 0, ease: 'easeInOut' }}
            >
              <Zap className={`w-5 h-5 ${showVerifiedOnly ? 'text-white' : 'text-cyan-300'}`} strokeWidth={2.6} />
            </motion.span>
          </motion.button>
        </>
      )}
    </motion.div>
  );
}