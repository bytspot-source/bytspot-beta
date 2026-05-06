import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { motion } from 'motion/react';
import { ArrowLeft, Building2, CalendarDays, Car, MapPin, Radio, Shield, Sparkles, Zap } from 'lucide-react';
import { BrandLogo } from '../BrandLogo';
import { ProviderInstallPrompt } from './ProviderInstallPrompt';

export type ProviderRole = 'parking' | 'venue' | 'event' | 'service';

interface ProviderLandingProps {
  onStart: (role: ProviderRole) => void;
  onBackToParker?: () => void;
}

const roles: Array<{ id: ProviderRole; title: string; body: string; icon: typeof MapPin; gradient: string }> = [
  { id: 'parking', title: 'Parking Provider', body: 'List lots, garages, private spaces, or managed parking inventory.', icon: MapPin, gradient: 'from-cyan-500 to-blue-500' },
  { id: 'venue', title: 'Venue Provider', body: 'Create Tap & Scan access for bars, lounges, restaurants, and venues.', icon: Building2, gradient: 'from-purple-500 to-fuchsia-500' },
  { id: 'event', title: 'Event Partner', body: 'Set up temporary access, guest flow, and live event demand windows.', icon: CalendarDays, gradient: 'from-orange-500 to-rose-500' },
  { id: 'service', title: 'Valet / Service Team', body: 'Prepare dispatch, valet operations, add-ons, and provider tools.', icon: Car, gradient: 'from-emerald-500 to-cyan-500' },
];

export function ProviderLanding({ onStart, onBackToParker }: ProviderLandingProps) {
  const [selectedRole, setSelectedRole] = useState<ProviderRole>('parking');
  const selected = useMemo(() => roles.find((role) => role.id === selectedRole) ?? roles[0], [selectedRole]);
  const headingId = useId();
  const groupLabelId = useId();
  const tileRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [isTablet, setIsTablet] = useState(() => (
    typeof window !== 'undefined' ? window.matchMedia('(min-width: 768px)').matches : false
  ));

  useEffect(() => {
    const media = window.matchMedia('(min-width: 768px)');
    const onChange = () => setIsTablet(media.matches);
    onChange();
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  const focusRoleAt = useCallback((index: number) => {
    const next = (index + roles.length) % roles.length;
    setSelectedRole(roles[next].id);
    tileRefs.current[next]?.focus();
  }, []);

  const onTileKeyDown = useCallback((event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowRight':
        event.preventDefault();
        focusRoleAt(index + 1);
        break;
      case 'ArrowUp':
      case 'ArrowLeft':
        event.preventDefault();
        focusRoleAt(index - 1);
        break;
      case 'Home':
        event.preventDefault();
        focusRoleAt(0);
        break;
      case 'End':
        event.preventDefault();
        focusRoleAt(roles.length - 1);
        break;
    }
  }, [focusRoleAt]);

  const springConfig = { type: 'spring' as const, stiffness: 320, damping: 30, mass: 0.8 };

  return (
    <div data-testid="provider-landing-root" className="relative min-h-screen overflow-y-auto bg-black text-white" aria-labelledby={headingId}>
      <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
        <div className="absolute top-[-120px] left-1/2 h-96 w-96 -translate-x-1/2 rounded-full bg-purple-500/20 blur-3xl md:h-[34rem] md:w-[34rem]" />
        <div className="absolute bottom-0 right-[-80px] h-80 w-80 rounded-full bg-cyan-500/15 blur-3xl md:h-[30rem] md:w-[30rem]" />
      </div>

      <div className="relative mx-auto max-w-[393px] px-5 pb-10 pt-5" style={isTablet ? { maxWidth: 820, padding: '32px 32px 48px' } : undefined}>
        {onBackToParker && (
          <button
            data-testid="provider-back-cta"
            type="button"
            onClick={onBackToParker}
            aria-label="Back to Parker consumer app"
            className="mb-5 flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
            style={isTablet ? { width: 48, height: 48, marginBottom: 28 } : undefined}
          >
            <ArrowLeft className="h-5 w-5" style={isTablet ? { width: 24, height: 24 } : undefined} strokeWidth={2.5} aria-hidden="true" />
          </button>
        )}

        <motion.div className="text-center" style={isTablet ? { maxWidth: 720, margin: '0 auto' } : undefined} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={springConfig}>
          <div className="mb-5 flex justify-center" style={isTablet ? { marginBottom: 28 } : undefined} aria-hidden="true"><BrandLogo size={isTablet ? 108 : 86} animated /></div>
          <p className="mb-2 text-[12px] font-bold tracking-[0.28em] text-cyan-200">BYTSPOT PROVIDER</p>
          <h1 id={headingId} className="mb-4 text-[36px] font-black leading-[0.95] tracking-[-0.05em]" style={isTablet ? { fontSize: 56 } : undefined}>Onboard fast. Start earning.</h1>
          <p className="mx-auto mb-6 max-w-[340px] text-[15px] leading-6 text-white/70" style={isTablet ? { maxWidth: 620, marginBottom: 32, fontSize: 18, lineHeight: '28px' } : undefined}>
            One Provider entry for parking, venue, event, hospitality, and valet/service teams.
          </p>
        </motion.div>

        <ProviderInstallPrompt />

        <div style={isTablet ? { display: 'grid', gridTemplateColumns: '1.12fr 0.88fr', alignItems: 'start', gap: 20 } : undefined}>
        <motion.section
          aria-labelledby={groupLabelId}
          className="mb-5 rounded-[26px] border border-white/15 bg-white/[0.07] p-4 shadow-2xl"
          style={isTablet ? { marginBottom: 0, borderRadius: 32, padding: 20 } : undefined}
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...springConfig, delay: 0.08 }}
        >
          <h2 id={groupLabelId} className="mb-3 flex items-center gap-2 text-[13px] font-bold text-white/80" style={isTablet ? { marginBottom: 16, fontSize: 15 } : undefined}>
            <Sparkles className="h-4 w-4 text-fuchsia-300" style={isTablet ? { width: 20, height: 20 } : undefined} strokeWidth={2.5} aria-hidden="true" />
            Choose what you want to launch
          </h2>
          <div role="radiogroup" aria-labelledby={groupLabelId} className="grid grid-cols-1 gap-2" style={isTablet ? { gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 } : undefined}>
            {roles.map((role, index) => {
              const Icon = role.icon;
              const active = selectedRole === role.id;
              return (
                <button
                  key={role.id}
                  ref={(node) => { tileRefs.current[index] = node; }}
                  data-testid={`provider-role-tile-${role.id}`}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  tabIndex={active ? 0 : -1}
                  onClick={() => setSelectedRole(role.id)}
                  onKeyDown={(event) => onTileKeyDown(event, index)}
                  className={`rounded-[18px] border p-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 ${active ? 'border-white/45 bg-white/15' : 'border-white/10 bg-black/20'}`}
                  style={isTablet ? { minHeight: 128, borderRadius: 22, padding: 16 } : undefined}
                >
                  <div className="flex gap-3" style={isTablet ? { flexDirection: 'column', gap: 16 } : undefined}>
                    <div data-testid={`provider-role-icon-${role.id}`} className={`flex items-center justify-center bg-gradient-to-br ${role.gradient}`} style={{ width: isTablet ? 56 : 40, minWidth: isTablet ? 56 : 40, height: isTablet ? 56 : 40, flexShrink: 0, borderRadius: isTablet ? 18 : 14 }} aria-hidden="true"><Icon style={{ width: isTablet ? 24 : 20, height: isTablet ? 24 : 20 }} strokeWidth={2.5} /></div>
                    <div>
                      <p className="text-[15px] font-bold" style={isTablet ? { fontSize: 17 } : undefined}>{role.title}</p>
                      <p className="mt-0.5 text-[12px] leading-5 text-white/58" style={isTablet ? { marginTop: 4, fontSize: 13, lineHeight: '20px' } : undefined}>{role.body}</p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </motion.section>

        <div style={isTablet ? { display: 'flex', flexDirection: 'column', gap: 20 } : undefined}>
        <motion.section aria-labelledby="provider-patches-heading" className="mb-5 rounded-[24px] border border-cyan-300/25 bg-cyan-500/10 p-4" style={isTablet ? { marginBottom: 0, borderRadius: 30, padding: 20 } : undefined} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ ...springConfig, delay: 0.14 }}>
          <div className="mb-3 flex items-center gap-2">
            <Radio className="h-5 w-5 text-cyan-200" style={isTablet ? { width: 24, height: 24 } : undefined} aria-hidden="true" />
            <h2 id="provider-patches-heading" className="text-[16px] font-extrabold" style={isTablet ? { fontSize: 20 } : undefined}>Patches can be established and used</h2>
          </div>
          <p className="text-[13px] leading-5 text-white/68" style={isTablet ? { fontSize: 14, lineHeight: '24px' } : undefined}>
            After onboarding, create Bytspot patch links for your venue, lot, or event. Customers tap/scan the patch to launch App Clip or the full app.
          </p>
          <ul className="mt-3 grid grid-cols-3 gap-2 text-center text-[11px] font-bold text-white/75" style={isTablet ? { marginTop: 16, fontSize: 12 } : undefined}>
            <li className="rounded-2xl bg-black/25 p-2" style={isTablet ? { paddingTop: 12, paddingBottom: 12 } : undefined}><Shield className="mx-auto mb-1 h-4 w-4 text-emerald-300" style={isTablet ? { width: 20, height: 20 } : undefined} aria-hidden="true" />Verify</li>
            <li className="rounded-2xl bg-black/25 p-2" style={isTablet ? { paddingTop: 12, paddingBottom: 12 } : undefined}><Zap className="mx-auto mb-1 h-4 w-4 text-yellow-300" style={isTablet ? { width: 20, height: 20 } : undefined} aria-hidden="true" />Access</li>
            <li className="rounded-2xl bg-black/25 p-2" style={isTablet ? { paddingTop: 12, paddingBottom: 12 } : undefined}><Radio className="mx-auto mb-1 h-4 w-4 text-cyan-300" style={isTablet ? { width: 20, height: 20 } : undefined} aria-hidden="true" />Tap</li>
          </ul>
        </motion.section>

        <motion.button
          data-testid="provider-start-cta"
          type="button"
          onClick={() => onStart(selected.id)}
          aria-label={`Start ${selected.title} onboarding`}
          className="w-full rounded-[20px] bg-gradient-to-r from-cyan-500 via-purple-500 to-fuchsia-500 px-5 py-4 text-[16px] font-black shadow-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
          style={isTablet ? { borderRadius: 24, padding: '20px 24px', fontSize: 18 } : undefined}
          whileTap={{ scale: 0.97 }}
          transition={springConfig}
        >
          Start {selected.title} Onboarding
        </motion.button>
        <p className="mt-3 text-center text-[12px] leading-5 text-white/45" style={isTablet ? { fontSize: 13, lineHeight: '24px' } : undefined}>Fast setup now. Premium AI tools and boosted placement can unlock after approval.</p>
        </div>
        </div>
      </div>
    </div>
  );
}