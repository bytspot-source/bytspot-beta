import { motion } from 'motion/react';
import { ArrowLeft, Bike, Battery, Save, AlertTriangle, CheckCircle } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner@2.0.3';
import type { EBikeSpec } from '../../../utils/valetMockData';

interface DriverGearRegistryProps {
  isDarkMode: boolean;
  onBack: () => void;
  initialGear?: EBikeSpec;
  initialBattery?: number;
  onSave?: (gear: EBikeSpec, battery: number) => void;
}

const COMPACT_MAX_CM = 80;

export function DriverGearRegistry({
  isDarkMode,
  onBack,
  initialGear,
  initialBattery = 100,
  onSave,
}: DriverGearRegistryProps) {
  const springConfig = { type: 'spring' as const, stiffness: 320, damping: 30, mass: 0.8 };

  const [battery, setBattery] = useState(initialBattery);
  const [gear, setGear] = useState<EBikeSpec>(
    initialGear ?? {
      brand: '',
      model: '',
      foldedLengthCm: 0,
      foldedWidthCm: 0,
      foldedHeightCm: 0,
      weightKg: 0,
      sizeClass: 'compact',
    }
  );

  /** Derive size class from folded length */
  const deriveSizeClass = (lengthCm: number): EBikeSpec['sizeClass'] => {
    if (lengthCm <= COMPACT_MAX_CM) return 'compact';
    if (lengthCm <= 110) return 'standard';
    return 'large';
  };

  const updateDim = (field: 'foldedLengthCm' | 'foldedWidthCm' | 'foldedHeightCm', val: number) => {
    const updated = { ...gear, [field]: val };
    updated.sizeClass = deriveSizeClass(updated.foldedLengthCm);
    setGear(updated);
  };

  const handleSave = () => {
    if (!gear.brand || !gear.model || gear.foldedLengthCm <= 0) {
      toast.error('Missing fields', { description: 'Fill in brand, model, and dimensions' });
      return;
    }
    onSave?.(gear, battery);
    toast.success('Gear registry saved', { description: `${gear.brand} ${gear.model} — ${gear.sizeClass} class` });
    onBack();
  };

  const batteryColor = battery >= 50 ? 'from-green-500 to-emerald-500' : battery >= 20 ? 'from-yellow-500 to-orange-500' : 'from-red-500 to-pink-500';
  const batteryGate = battery < 20;
  const sizeColor = gear.sizeClass === 'compact' ? 'text-green-300' : gear.sizeClass === 'standard' ? 'text-yellow-300' : 'text-red-300';

  return (
    <div className="h-full overflow-y-auto pb-24">
      {/* Header */}
      <motion.div className="px-4 pt-4 pb-4 flex items-center gap-3 sticky top-0 bg-[#000000] z-10"
        initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={springConfig}>
        <motion.button onClick={onBack}
          className="w-10 h-10 rounded-full flex items-center justify-center bg-[#1C1C1E]/80 backdrop-blur-xl border-2 border-white/30 shadow-xl"
          whileTap={{ scale: 0.9 }} transition={springConfig}>
          <ArrowLeft className="w-5 h-5 text-white" strokeWidth={2.5} />
        </motion.button>
        <div>
          <h1 className="text-title-2 text-white">Gear Registry</h1>
          <p className="text-[13px] text-white/60" style={{ fontWeight: 400 }}>E-bike specs &amp; battery status</p>
        </div>
      </motion.div>

      <div className="px-4 space-y-5">
        {/* Battery Level */}
        <motion.div className="rounded-[24px] p-6 border-2 border-white/30 bg-[#1C1C1E]/80 backdrop-blur-xl shadow-xl"
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ ...springConfig, delay: 0.05 }}>
          <div className="flex items-center gap-2 mb-4">
            <Battery className="w-5 h-5 text-cyan-400" strokeWidth={2.5} />
            <h3 className="text-[17px] text-white" style={{ fontWeight: 600 }}>Current Battery Level</h3>
          </div>
          <div className="flex items-center gap-4 mb-3">
            <div className={`text-[48px] bg-gradient-to-r ${batteryColor} bg-clip-text text-transparent`} style={{ fontWeight: 700 }}>
              {battery}%
            </div>
            {batteryGate && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-[12px] bg-red-500/20 border border-red-400/40">
                <AlertTriangle className="w-4 h-4 text-red-400" strokeWidth={2.5} />
                <span className="text-[12px] text-red-300" style={{ fontWeight: 600 }}>Below 20% — jobs gated</span>
              </div>
            )}
          </div>
          <div className="w-full h-3 rounded-full bg-white/10 overflow-hidden mb-3">
            <div className={`h-full rounded-full bg-gradient-to-r ${batteryColor} transition-all duration-300`} style={{ width: `${battery}%` }} />
          </div>
          <input type="range" min={0} max={100} value={battery}
            onChange={(e) => setBattery(parseInt(e.target.value))}
            className="w-full accent-purple-500" />
          <p className="text-[11px] text-white/40 mt-2" style={{ fontWeight: 400 }}>
            Set your e-bike battery before going online. Jobs will be gated below 20%.
          </p>
        </motion.div>

        {/* E-Bike Specs */}
        <motion.div className="rounded-[24px] p-6 border-2 border-white/30 bg-[#1C1C1E]/80 backdrop-blur-xl shadow-xl"
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ ...springConfig, delay: 0.1 }}>
          <div className="flex items-center gap-2 mb-4">
            <Bike className="w-5 h-5 text-purple-400" strokeWidth={2.5} />
            <h3 className="text-[17px] text-white" style={{ fontWeight: 600 }}>E-Bike Specifications</h3>
          </div>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              {(['brand', 'model'] as const).map((field) => (
                <div key={field}>
                  <label className="text-[13px] text-white/80 mb-2 block capitalize" style={{ fontWeight: 500 }}>{field} *</label>
                  <input type="text" value={gear[field]}
                    onChange={(e) => setGear({ ...gear, [field]: e.target.value })}
                    placeholder={field === 'brand' ? 'Brompton' : 'Electric C Line'}
                    className="w-full rounded-[14px] px-4 py-3 border-2 border-white/30 bg-white/5 text-[14px] outline-none text-white placeholder:text-white/40"
                    style={{ fontWeight: 400 }} />
                </div>
              ))}
            </div>

            <div>
              <label className="text-[13px] text-white/80 mb-2 block" style={{ fontWeight: 500 }}>Folded Dimensions (cm) *</label>
              <div className="grid grid-cols-3 gap-3">
                {([
                  { key: 'foldedLengthCm', label: 'Length' },
                  { key: 'foldedWidthCm', label: 'Width' },
                  { key: 'foldedHeightCm', label: 'Height' },
                ] as { key: 'foldedLengthCm' | 'foldedWidthCm' | 'foldedHeightCm'; label: string }[]).map(({ key, label }) => (
                  <div key={key}>
                    <label className="text-[11px] text-white/60 mb-1 block" style={{ fontWeight: 500 }}>{label}</label>
                    <input type="number" value={gear[key] || ''}
                      onChange={(e) => updateDim(key, parseFloat(e.target.value) || 0)}
                      placeholder="0"
                      className="w-full rounded-[12px] px-3 py-2.5 border-2 border-white/30 bg-white/5 text-[14px] outline-none text-white"
                      style={{ fontWeight: 500 }} />
                  </div>
                ))}
              </div>
            </div>

            <div>
              <label className="text-[13px] text-white/80 mb-2 block" style={{ fontWeight: 500 }}>Weight (kg)</label>
              <input type="number" value={gear.weightKg || ''}
                onChange={(e) => setGear({ ...gear, weightKg: parseFloat(e.target.value) || 0 })}
                placeholder="e.g., 16.6"
                className="w-full rounded-[14px] px-4 py-3 border-2 border-white/30 bg-white/5 text-[14px] outline-none text-white placeholder:text-white/40"
                style={{ fontWeight: 400 }} />
            </div>

            {/* Computed size class */}
            {gear.foldedLengthCm > 0 && (
              <div className="p-3 rounded-[12px] bg-white/5 border border-white/20 flex items-center gap-3">
                <CheckCircle className="w-5 h-5 text-green-400 flex-shrink-0" strokeWidth={2.5} />
                <div>
                  <span className="text-[13px] text-white/70">Computed size class: </span>
                  <span className={`text-[13px] ${sizeColor}`} style={{ fontWeight: 700 }}>{gear.sizeClass.toUpperCase()}</span>
                  <p className="text-[11px] text-white/40 mt-0.5" style={{ fontWeight: 400 }}>
                    {gear.sizeClass === 'compact'
                      ? '✅ Fits full/compact/frunk trunks'
                      : gear.sizeClass === 'standard'
                      ? '⚠️ Fits full trunk only'
                      : '🚫 Does not fit most trunks — confirm manually'}
                  </p>
                </div>
              </div>
            )}
          </div>
        </motion.div>

        {/* Save */}
        <motion.button onClick={handleSave}
          className="w-full rounded-[20px] px-6 py-4 flex items-center justify-center gap-2 border-2 border-white/30 bg-gradient-to-br from-purple-500 to-pink-500 text-white shadow-xl"
          whileTap={{ scale: 0.98 }} transition={springConfig}
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <Save className="w-5 h-5" strokeWidth={2.5} />
          <span className="text-[17px]" style={{ fontWeight: 600 }}>Save Gear Registry</span>
        </motion.button>
      </div>
    </div>
  );
}

