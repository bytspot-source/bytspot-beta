import { motion } from 'motion/react';
import { Activity, Crosshair, Layers, MapPin, Minus, Plus } from 'lucide-react';

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
  onShowPartneredProviders: (event: React.MouseEvent<HTMLButtonElement>) => void;
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
  onShowPartneredProviders,
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
            className={`w-11 h-11 rounded-full flex items-center justify-center border-2 shadow-xl transition-colors ${showTrafficIntel ? 'bg-cyan-500 border-cyan-100' : 'bg-[#050505] border-white/40'}`}
            whileTap={{ scale: 0.9 }}
            transition={transition}
            title="Traffic Intelligence"
            aria-label="Traffic intelligence"
            data-testid="traffic-intelligence-fab"
          >
            <Activity className={`w-5 h-5 ${showTrafficIntel ? 'text-white' : 'text-cyan-300'}`} strokeWidth={2.5} />
          </motion.button>
          <motion.button
            onClick={onShowPartneredProviders}
            className={`relative w-11 h-11 rounded-full flex items-center justify-center border-2 shadow-xl transition-colors ${showVerifiedOnly ? 'bg-cyan-500 border-cyan-100' : 'bg-[#050505] border-white/40'}`}
            whileTap={{ scale: 0.9 }}
            transition={transition}
            aria-pressed={showVerifiedOnly}
            aria-label="Show partnered Tap Zone providers"
            data-testid="partnered-vendors-patch-button"
            title="Partnered Tap Zone providers"
          >
            <MapPin className={`w-5 h-5 ${showVerifiedOnly ? 'text-white' : 'text-cyan-300'}`} strokeWidth={2.6} />
          </motion.button>
        </>
      )}
    </motion.div>
  );
}