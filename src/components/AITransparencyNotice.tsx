/**
 * AI Transparency notice — bottom sheet surfaced from the map filter bar.
 *
 * Plain-language explanation of what signals Bytspot reads to populate the
 * map (vibe levels, proximity to Verified venues, patch-tap success), what
 * the on-screen "operational efficiency" surfaces describe (a venue session,
 * not a person), and the staff-decides-service invariant the codebase
 * enforces in `src/utils/efficiencyScore.ts` (`decidesService: false`).
 *
 * Copy is intentionally factual and free of marketing-flavored performance
 * claims. The sheet is purely informational — closing it is the only action.
 */
import { AnimatePresence, motion } from 'motion/react';
import { createPortal } from 'react-dom';
import { Sparkles, ShieldCheck, Info, X } from 'lucide-react';

interface AITransparencyNoticeProps {
  isOpen: boolean;
  onClose: () => void;
}

const SIGNALS_USED: ReadonlyArray<{ label: string; detail: string }> = [
  { label: 'Vibe level', detail: 'Aggregate crowd reports and check-in velocity at each venue.' },
  { label: 'Proximity', detail: 'Distance from your device to a Bytspot Verified venue, computed locally.' },
  { label: 'Patch handshake', detail: 'Result of an NFC tap or QR scan against a venue\u2019s hardware patch.' },
  { label: 'Operating hours', detail: 'Venue-published open / close windows used to flag trending tiles.' },
];

const NOT_USED: ReadonlyArray<string> = [
  'Behavioral profiling or scoring of individual customers.',
  'Predictions about who you are, where you live, or what you\u2019ll do next.',
  'Selling any of the signals above to ad networks or third parties.',
];

export function AITransparencyNotice({ isOpen, onClose }: AITransparencyNoticeProps) {
  if (typeof document === 'undefined') return null;
  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-[1006] bg-black/55 backdrop-blur-[2px] flex items-end justify-center p-3"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          role="dialog"
          aria-modal="true"
          aria-labelledby="byt-ai-notice-title"
        >
          <motion.div
            className="w-full max-w-sm rounded-[28px] border border-cyan-300/30 bg-[#11131A]/96 backdrop-blur-2xl shadow-2xl overflow-hidden"
            style={{ boxShadow: '0 0 46px rgba(34,211,238,0.18), 0 18px 48px rgba(0,0,0,0.52)' }}
            initial={{ y: 140, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 140, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 320, damping: 30 }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="relative p-6 pb-5">
              <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.20),transparent_68%)]" />

              <div className="relative">
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div className="min-w-0">
                    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-cyan-400/12 border border-cyan-300/25 text-cyan-100 text-[11px] tracking-[0.18em] uppercase mb-3" style={{ fontWeight: 800 }}>
                      <Sparkles className="w-3.5 h-3.5" strokeWidth={2.4} />
                      How Bytspot AI works
                    </div>
                    <h3 id="byt-ai-notice-title" className="text-[22px] text-white leading-[1.1] tracking-[-0.02em]" style={{ fontWeight: 800 }}>
                      {'What we read, and what we don\u2019t'}
                    </h3>
                    <p className="text-[13px] text-white/68 mt-2 leading-[1.55]" style={{ fontWeight: 500 }}>
                      {'The map ranks venues from operational signals about places, not predictions about people. Staff decide service at every venue \u2014 the score never does.'}
                    </p>
                  </div>
                  <motion.button
                    onClick={onClose}
                    className="mt-0.5 w-9 h-9 rounded-full flex items-center justify-center bg-white/7 border border-white/12 text-white/70"
                    whileTap={{ scale: 0.92 }}
                    aria-label="Close"
                  >
                    <X className="w-4 h-4" />
                  </motion.button>
                </div>

                <div className="rounded-[18px] border border-white/10 bg-white/[0.03] p-4 mb-3">
                  <div className="flex items-center gap-2 mb-3">
                    <Info className="w-3.5 h-3.5 text-cyan-200" strokeWidth={2.4} />
                    <span className="text-[10px] uppercase tracking-[0.22em] text-cyan-100/70" style={{ fontWeight: 800 }}>Signals we use</span>
                  </div>
                  <ul className="space-y-2.5">
                    {SIGNALS_USED.map((signal) => (
                      <li key={signal.label} className="flex items-start gap-2.5">
                        <span className="mt-[5px] w-1.5 h-1.5 rounded-full bg-cyan-300/80 shrink-0" />
                        <div className="min-w-0">
                          <div className="text-[13px] text-white" style={{ fontWeight: 700 }}>{signal.label}</div>
                          <div className="text-[12px] text-white/65 leading-[1.45]" style={{ fontWeight: 500 }}>{signal.detail}</div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="rounded-[18px] border border-white/10 bg-white/[0.03] p-4 mb-4">
                  <div className="flex items-center gap-2 mb-3">
                    <ShieldCheck className="w-3.5 h-3.5 text-fuchsia-200" strokeWidth={2.4} />
                    <span className="text-[10px] uppercase tracking-[0.22em] text-fuchsia-100/70" style={{ fontWeight: 800 }}>{'What we don\u2019t do'}</span>
                  </div>
                  <ul className="space-y-2">
                    {NOT_USED.map((item) => (
                      <li key={item} className="flex items-start gap-2.5 text-[12px] text-white/72 leading-[1.5]" style={{ fontWeight: 500 }}>
                        <span className="mt-[6px] w-1 h-1 rounded-full bg-white/40 shrink-0" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <p className="text-[11px] text-white/45 leading-[1.55] mb-4" style={{ fontWeight: 500 }}>
                  {'Operational efficiency surfaces shown to venue staff describe a venue session \u2014 not a customer. Customers cannot be scored. The score never decides who is served.'}
                </p>

                <motion.button
                  onClick={onClose}
                  className="w-full px-4 py-3 rounded-[16px] bg-white/8 border border-white/12 text-white"
                  whileTap={{ scale: 0.98 }}
                >
                  <span className="text-[13px]" style={{ fontWeight: 700 }}>Got it</span>
                </motion.button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
