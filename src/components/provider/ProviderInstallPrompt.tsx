import { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { Download, Share2, Smartphone, X } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

const DISMISS_KEY = 'bytspot_provider_install_prompt_dismissed';

function isStandalonePwa(): boolean {
  if (typeof window === 'undefined') return false;
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches;
  const iosStandalone = Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone);
  return Boolean(standalone || iosStandalone);
}

function isIosSafari(): boolean {
  if (typeof window === 'undefined') return false;
  const ua = window.navigator.userAgent;
  const isiOS = /iPad|iPhone|iPod/.test(ua) || (ua.includes('Mac') && 'ontouchend' in document);
  const isSafari = /^((?!chrome|android|crios|fxios).)*safari/i.test(ua);
  return isiOS && isSafari;
}

export function ProviderInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(DISMISS_KEY) === 'true');
  const iosSafari = useMemo(() => isIosSafari(), []);
  const canShow = !dismissed && !isStandalonePwa();

  useEffect(() => {
    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  }, []);

  if (!canShow || (!deferredPrompt && !iosSafari)) return null;

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, 'true');
    setDismissed(true);
  };

  const install = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    await deferredPrompt.userChoice.catch(() => undefined);
    setDeferredPrompt(null);
    dismiss();
  };

  return (
    <motion.div
      className="mb-5 rounded-[24px] border border-emerald-300/25 bg-emerald-500/10 p-4 shadow-2xl"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 320, damping: 30, mass: 0.8 }}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[16px] bg-gradient-to-br from-emerald-400 to-cyan-500">
            <Smartphone className="h-5 w-5 text-white" strokeWidth={2.5} />
          </div>
          <div>
            <p className="text-[16px] font-extrabold text-white">Save Bytspot Provider</p>
            <p className="mt-1 text-[12px] leading-5 text-white/65">
              Add this provider entry to your home screen so providers can open onboarding in one tap.
            </p>
          </div>
        </div>
        <button onClick={dismiss} className="rounded-full bg-white/10 p-1.5 text-white/60">
          <X className="h-4 w-4" />
        </button>
      </div>

      {deferredPrompt ? (
        <button onClick={install} className="flex w-full items-center justify-center gap-2 rounded-[16px] bg-white px-4 py-3 text-[14px] font-black text-black">
          <Download className="h-4 w-4" strokeWidth={2.5} /> Install Provider App
        </button>
      ) : (
        <div className="rounded-[16px] bg-black/25 p-3 text-[12px] leading-5 text-white/70">
          <Share2 className="mr-2 inline h-4 w-4 text-cyan-200" />
          On iPhone, tap Safari Share, then choose <span className="font-bold text-white">Add to Home Screen</span>.
        </div>
      )}
    </motion.div>
  );
}