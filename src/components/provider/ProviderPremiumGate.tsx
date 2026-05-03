import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { CheckCircle2, Crown, Lock, Sparkles, Zap } from 'lucide-react';
import {
  activateProviderPremiumPreview,
  getProviderPremiumEntitlement,
  PROVIDER_PREMIUM_EVENT,
  type ProviderPremiumEntitlement,
} from '../../utils/providerPremium';

interface ProviderPremiumGateProps {
  title: string;
  description: string;
  features: string[];
  compact?: boolean;
}

export function ProviderPremiumGate({ title, description, features, compact = false }: ProviderPremiumGateProps) {
  const [entitlement, setEntitlement] = useState<ProviderPremiumEntitlement>(() => getProviderPremiumEntitlement());

  useEffect(() => {
    const refresh = () => setEntitlement(getProviderPremiumEntitlement());
    window.addEventListener(PROVIDER_PREMIUM_EVENT, refresh);
    return () => window.removeEventListener(PROVIDER_PREMIUM_EVENT, refresh);
  }, []);

  const activatePreview = () => setEntitlement(activateProviderPremiumPreview('vendor-premium'));

  return (
    <motion.div
      className={`rounded-[22px] border ${entitlement.isActive ? 'border-emerald-300/30 bg-emerald-500/10' : 'border-amber-300/30 bg-amber-500/10'} ${compact ? 'p-4' : 'p-5'}`}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 320, damping: 30, mass: 0.8 }}
    >
      <div className="mb-3 flex items-start gap-3">
        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-[15px] ${entitlement.isActive ? 'bg-gradient-to-br from-emerald-400 to-cyan-500' : 'bg-gradient-to-br from-amber-400 to-orange-500'}`}>
          {entitlement.isActive ? <CheckCircle2 className="h-5 w-5 text-white" /> : <Crown className="h-5 w-5 text-white" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <p className="text-[16px] font-extrabold text-white">{title}</p>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${entitlement.isActive ? 'bg-emerald-400/20 text-emerald-200' : 'bg-amber-400/20 text-amber-200'}`}>
              {entitlement.isActive ? entitlement.label : 'VENDOR PREMIUM'}
            </span>
          </div>
          <p className="text-[12px] leading-5 text-white/65">{description}</p>
        </div>
      </div>

      <div className="grid gap-2">
        {features.map((feature) => (
          <div key={feature} className="flex items-center gap-2 rounded-[14px] bg-black/25 px-3 py-2 text-[12px] font-semibold text-white/75">
            {entitlement.isActive ? <Zap className="h-4 w-4 text-cyan-200" /> : <Lock className="h-4 w-4 text-amber-200" />}
            {feature}
          </div>
        ))}
      </div>

      <div className="mt-3 rounded-[14px] bg-black/20 p-3 text-[11px] leading-5 text-white/55">
        <Sparkles className="mr-1 inline h-3.5 w-3.5 text-fuchsia-200" />
        AI ranking uses Es = Φ_EM + Φ_E + ΔD + f × λ_sim. Provider Premium unlocks recommendations, not automatic service decisions.
      </div>

      {!entitlement.isActive && (
        <button onClick={activatePreview} className="mt-3 w-full rounded-[16px] bg-white px-4 py-3 text-[13px] font-black text-black">
          Preview Vendor Premium
        </button>
      )}
    </motion.div>
  );
}