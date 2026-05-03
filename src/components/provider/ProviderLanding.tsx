import { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { ArrowLeft, Building2, CalendarDays, Car, MapPin, Radio, Shield, Sparkles, Zap } from 'lucide-react';
import { BrandLogo } from '../BrandLogo';

export type ProviderRole = 'parking' | 'venue' | 'event' | 'service';

interface ProviderLandingProps {
  onStart: (role: ProviderRole) => void;
  onBackToParker?: () => void;
}

const roles: Array<{ id: ProviderRole; title: string; body: string; icon: typeof MapPin; gradient: string }> = [
  { id: 'parking', title: 'Parking Host', body: 'List lots, garages, private spaces, or managed parking inventory.', icon: MapPin, gradient: 'from-cyan-500 to-blue-500' },
  { id: 'venue', title: 'Venue Vendor', body: 'Create Tap & Scan access for bars, lounges, restaurants, and venues.', icon: Building2, gradient: 'from-purple-500 to-fuchsia-500' },
  { id: 'event', title: 'Event Partner', body: 'Set up temporary access, guest flow, and live event demand windows.', icon: CalendarDays, gradient: 'from-orange-500 to-rose-500' },
  { id: 'service', title: 'Valet / Service Team', body: 'Prepare dispatch, valet operations, add-ons, and provider tools.', icon: Car, gradient: 'from-emerald-500 to-cyan-500' },
];

export function ProviderLanding({ onStart, onBackToParker }: ProviderLandingProps) {
  const [selectedRole, setSelectedRole] = useState<ProviderRole>('parking');
  const selected = useMemo(() => roles.find((role) => role.id === selectedRole) ?? roles[0], [selectedRole]);

  const springConfig = { type: 'spring' as const, stiffness: 320, damping: 30, mass: 0.8 };

  return (
    <div className="relative min-h-screen overflow-y-auto bg-black text-white">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-[-120px] left-1/2 h-96 w-96 -translate-x-1/2 rounded-full bg-purple-500/20 blur-3xl" />
        <div className="absolute bottom-0 right-[-80px] h-80 w-80 rounded-full bg-cyan-500/15 blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-[430px] px-5 pb-10 pt-5">
        {onBackToParker && (
          <button onClick={onBackToParker} className="mb-5 flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-white/10">
            <ArrowLeft className="h-5 w-5" strokeWidth={2.5} />
          </button>
        )}

        <motion.div className="text-center" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={springConfig}>
          <div className="mb-5 flex justify-center"><BrandLogo size={86} animated /></div>
          <p className="mb-2 text-[12px] font-bold tracking-[0.28em] text-cyan-200">BYTSPOT PROVIDER</p>
          <h1 className="mb-4 text-[36px] font-black leading-[0.95] tracking-[-0.05em]">Onboard fast. Start earning.</h1>
          <p className="mx-auto mb-6 max-w-[340px] text-[15px] leading-6 text-white/70">
            One provider entry for hosts, vendors, venue partners, and valet/service teams.
          </p>
        </motion.div>

        <motion.div className="mb-5 rounded-[26px] border border-white/15 bg-white/[0.07] p-4 shadow-2xl" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ ...springConfig, delay: 0.08 }}>
          <div className="mb-3 flex items-center gap-2 text-[13px] font-bold text-white/80">
            <Sparkles className="h-4 w-4 text-fuchsia-300" strokeWidth={2.5} />
            Choose what you want to launch
          </div>
          <div className="grid grid-cols-1 gap-2">
            {roles.map((role) => {
              const Icon = role.icon;
              const active = selectedRole === role.id;
              return (
                <button key={role.id} onClick={() => setSelectedRole(role.id)} className={`rounded-[18px] border p-3 text-left transition ${active ? 'border-white/45 bg-white/15' : 'border-white/10 bg-black/20'}`}>
                  <div className="flex gap-3">
                    <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-gradient-to-br ${role.gradient}`}><Icon className="h-5 w-5" strokeWidth={2.5} /></div>
                    <div>
                      <p className="text-[15px] font-bold">{role.title}</p>
                      <p className="mt-0.5 text-[12px] leading-5 text-white/58">{role.body}</p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </motion.div>

        <motion.div className="mb-5 rounded-[24px] border border-cyan-300/25 bg-cyan-500/10 p-4" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ ...springConfig, delay: 0.14 }}>
          <div className="mb-3 flex items-center gap-2"><Radio className="h-5 w-5 text-cyan-200" /><p className="text-[16px] font-extrabold">Patches can be established and used</p></div>
          <p className="text-[13px] leading-5 text-white/68">
            After onboarding, create Bytspot patch links for your venue, lot, or event. Customers tap/scan the patch to launch App Clip or the full app.
          </p>
          <div className="mt-3 grid grid-cols-3 gap-2 text-center text-[11px] font-bold text-white/75">
            <div className="rounded-2xl bg-black/25 p-2"><Shield className="mx-auto mb-1 h-4 w-4 text-emerald-300" />Verify</div>
            <div className="rounded-2xl bg-black/25 p-2"><Zap className="mx-auto mb-1 h-4 w-4 text-yellow-300" />Access</div>
            <div className="rounded-2xl bg-black/25 p-2"><Radio className="mx-auto mb-1 h-4 w-4 text-cyan-300" />Tap</div>
          </div>
        </motion.div>

        <motion.button onClick={() => onStart(selected.id)} className="w-full rounded-[20px] bg-gradient-to-r from-cyan-500 via-purple-500 to-fuchsia-500 px-5 py-4 text-[16px] font-black shadow-2xl" whileTap={{ scale: 0.97 }} transition={springConfig}>
          Start {selected.title} Onboarding
        </motion.button>
        <p className="mt-3 text-center text-[12px] leading-5 text-white/45">Fast setup now. Premium AI tools and boosted placement can unlock after approval.</p>
      </div>
    </div>
  );
}