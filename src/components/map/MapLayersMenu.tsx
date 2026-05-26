import { motion, AnimatePresence } from 'motion/react';
import { Check, ChevronRight, X } from 'lucide-react';

export type MapLayerControlItem = {
  icon: string;
  label: string;
  detail: string;
  checked: boolean;
  onToggle: () => void;
};

export type MapLayerControlGroup = {
  group: string;
  items: MapLayerControlItem[];
};

type MapLayersMenuProps = {
  isOpen: boolean;
  showLayerButton: boolean;
  mapMode: string;
  groups: MapLayerControlGroup[];
  openGroup: string;
  onOpenGroup: (group: string) => void;
  onClose: () => void;
  transition: object;
};

function controlId(group: string) {
  return `map-layer-group-${group.replace(/\s+/g, '-').toLowerCase()}`;
}

export function MapLayersMenu({ isOpen, showLayerButton, mapMode, groups, openGroup, onOpenGroup, onClose, transition }: MapLayersMenuProps) {
  return (
    <AnimatePresence>
      {isOpen && showLayerButton && (
        <motion.div className="absolute inset-0 z-[1007] flex items-end px-3 pb-3" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
          <button type="button" className="absolute inset-0 bg-black/45" onClick={onClose} aria-label="Close Map Layers" />
          <motion.div
            className="relative z-10 flex w-full flex-col overflow-hidden rounded-[28px] border border-white/35 bg-[#050505] shadow-2xl"
            style={{ maxHeight: 'calc(100vh - 96px)' }}
            data-testid="map-layers-menu"
            role="dialog"
            aria-label="Map Layers"
            initial={{ y: 28, scale: 0.98 }}
            animate={{ y: 0, scale: 1 }}
            exit={{ y: 28, scale: 0.98 }}
            transition={transition}
          >
            <div className="mx-auto mt-3 h-1.5 w-12 rounded-full bg-white/70" />
            <div className="flex items-start justify-between gap-3 border-b border-white/15 px-4 pb-3 pt-3">
              <div className="min-w-0 flex-1">
                <p className="text-[10px] uppercase tracking-[0.16em] text-cyan-100" style={{ fontWeight: 900 }}>Map Layers</p>
                <h3 className="mt-1 text-[20px] leading-tight text-white" style={{ fontWeight: 900 }}>
                  {mapMode === 'navigation' ? 'What helps this route?' : 'What do you want to see?'}
                </h3>
                <p className="mt-0.5 text-[12px] text-white/85" style={{ fontWeight: 650 }}>
                  {mapMode === 'navigation' ? 'Only route-useful layers are shown.' : 'Pick the map signals that matter right now.'}
                </p>
              </div>
              <button type="button" onClick={onClose} className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border border-white/35 bg-[#080A10] text-white" aria-label="Close Map Layers">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="overflow-y-auto px-4 pb-4 pt-3 scrollbar-hide" style={{ maxHeight: 'calc(100vh - 240px)' }}>
              <div className="space-y-2.5">
                {groups.map(({ group, items }) => {
                  const isGroupOpen = openGroup === group;
                  const activeCount = items.filter(item => item.checked).length;
                  return (
                    <section key={group} className="rounded-[22px] border border-white/22 bg-[#080A10] p-2">
                      <button type="button" className={`flex min-h-[56px] w-full items-center gap-3 rounded-[18px] border px-3 py-2.5 text-left transition-colors ${isGroupOpen ? 'border-cyan-300 bg-[#06242B]' : 'border-transparent bg-[#0E1117]'}`} onClick={() => onOpenGroup(group)} aria-expanded={isGroupOpen} aria-controls={controlId(group)}>
                        <span className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-2xl border text-[13px] ${activeCount > 0 ? 'border-cyan-200 bg-cyan-400 text-black' : 'border-white/35 bg-[#050505] text-cyan-100'}`} style={{ fontWeight: 900 }}>{activeCount || items.length}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-[15px] leading-tight text-white" style={{ fontWeight: 900 }}>{group}</span>
                          <span className="mt-0.5 block text-[12px] leading-snug text-white/85" style={{ fontWeight: 650 }}>{activeCount > 0 ? `${activeCount} active` : `${items.length} option${items.length === 1 ? '' : 's'}`}</span>
                        </span>
                        <ChevronRight className={`h-5 w-5 flex-shrink-0 text-white transition-transform ${isGroupOpen ? 'rotate-90 text-cyan-100' : ''}`} strokeWidth={2.7} />
                      </button>
                      <AnimatePresence initial={false}>
                        {isGroupOpen && (
                          <motion.div id={controlId(group)} className="space-y-2 pt-2" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.18 }} style={{ overflow: 'hidden' }}>
                            {items.map(item => (
                              <button key={item.label} type="button" role="checkbox" aria-checked={item.checked} onClick={item.onToggle} data-layer-selected={item.checked ? 'true' : 'false'} className={`flex min-h-[74px] w-full items-center gap-3 rounded-[20px] border p-3.5 text-left transition-colors ${item.checked ? 'border-cyan-200 bg-cyan-400 text-black shadow-[0_0_0_2px_rgba(165,243,252,0.35)]' : 'border-white/30 bg-[#050505] text-white'}`}>
                                <span className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl border text-[16px] ${item.checked ? 'border-black/20 bg-black/10 text-black' : 'border-cyan-400/35 bg-[#061B22] text-cyan-100'}`} style={{ fontWeight: 900 }}>{item.icon}</span>
                                <span className="min-w-0 flex-1 pr-1">
                                  <span className={`block whitespace-normal text-[16px] leading-tight ${item.checked ? 'text-black' : 'text-white'}`} style={{ fontWeight: 950 }}>{item.label}</span>
                                  <span className={`mt-1 block whitespace-normal text-[12px] leading-snug ${item.checked ? 'text-black/80' : 'text-white/85'}`} style={{ fontWeight: 750 }}>{item.detail}</span>
                                </span>
                                <span className={`flex h-8 min-w-8 flex-shrink-0 items-center justify-center rounded-xl border px-1.5 ${item.checked ? 'border-black/25 bg-black text-cyan-200' : 'border-white/45 bg-[#080A10] text-transparent'}`}>
                                  {item.checked ? <span className="text-[10px] uppercase tracking-[0.08em]" style={{ fontWeight: 950 }}>On</span> : <Check className="h-4 w-4" strokeWidth={3} />}
                                </span>
                              </button>
                            ))}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </section>
                  );
                })}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}