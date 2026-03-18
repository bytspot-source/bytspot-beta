import { motion } from 'motion/react';
import { Mail, ArrowRight, MapPin, Car, Users, Clock, KeyRound, Shield, ExternalLink } from 'lucide-react';
import { useState, useEffect } from 'react';
import { BrandLogo } from './BrandLogo';
import { toast } from 'sonner@2.0.3';
import { Toaster } from './ui/sonner';
import { trpc } from '../utils/trpc';

// ============================================================
// CONFIGURATION — Update these before deploying to production
// ============================================================

/**
 * Backend provider for collecting signups.
 * 
 * Option A: Formspree (recommended for quick launch)
 *   1. Go to https://formspree.io and create a free account
 *   2. Create a new form, copy the form ID (e.g. "xpzvqkdl")
 *   3. Set FORMSPREE_FORM_ID below
 *   4. Set BACKEND_PROVIDER to 'formspree'
 * 
 * Option B: Custom API endpoint
 *   1. Set CUSTOM_API_URL to your endpoint
 *   2. Set BACKEND_PROVIDER to 'custom'
 *   3. Endpoint should accept POST { email: string } and return 200
 * 
 * Option C: Mock (current default — no real backend)
 *   - Emails are NOT saved anywhere
 *   - Use this only for previewing the UI
 */
// ============================================================

interface BetaSignupProps {
  isDarkMode?: boolean;
  onComplete?: () => void;
  /** When true, renders as a standalone page with its own Toaster */
  standalone?: boolean;
}

async function submitEmail(email: string, name?: string): Promise<{ ok: boolean; alreadyRegistered?: boolean; message?: string }> {
  try {
    const result = await trpc.betaSignup.signup.mutate({ email, name, source: 'bytspot-beta' });
    return { ok: result.ok, alreadyRegistered: result.alreadyRegistered };
  } catch (err: any) {
    return { ok: false, message: err?.message || 'Signup failed. Please try again.' };
  }
}

export function BetaSignup({ isDarkMode = true, onComplete, standalone = false }: BetaSignupProps) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [spotsLeft] = useState(27);
  const [alreadySignedUp, setAlreadySignedUp] = useState(false);

  // Check if user already signed up (localStorage persistence)
  useEffect(() => {
    const signedUp = localStorage.getItem('bytspot_beta_signed_up');
    if (signedUp) {
      setAlreadySignedUp(true);
      setIsSuccess(true);
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      toast.error('Please enter your email');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      toast.error('Please enter a valid email address');
      return;
    }

    setIsSubmitting(true);

    try {
      const result = await submitEmail(email, name.trim() || undefined);

      if (result.ok) {
        setIsSuccess(true);
        localStorage.setItem('bytspot_beta_signed_up', 'true');
        localStorage.setItem('bytspot_beta_email', email);

        if (result.alreadyRegistered) {
          toast.success("You're already on the list!", { description: 'Check your inbox for the welcome email.' });
        } else {
          const firstName = name.split(' ')[0].trim();
          toast.success(firstName ? `Welcome, ${firstName}! 🎯` : 'Welcome to the Inner Circle!', {
            description: "You've secured your spot. Check your inbox — your welcome email is on the way.",
          });
        }

        if (onComplete) {
          setTimeout(() => onComplete(), 2500);
        }
      } else {
        toast.error(result.message || 'Something went wrong. Please try again.');
      }
    } catch {
      toast.error('Network error. Please check your connection and try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      {standalone && <Toaster />}
      <div
        className={`min-h-screen relative overflow-hidden flex flex-col items-center justify-center px-6 py-12 ${
          isDarkMode ? 'bg-[#000000]' : 'bg-[#F5F7FA]'
        }`}
      >
        {/* Dynamic Background */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div
            className={`absolute top-[-10%] left-[-10%] w-[500px] h-[500px] rounded-full blur-[100px] opacity-30 ${
              isDarkMode ? 'bg-purple-600' : 'bg-purple-400'
            }`}
          />
          <div
            className={`absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] rounded-full blur-[100px] opacity-20 ${
              isDarkMode ? 'bg-cyan-600' : 'bg-cyan-400'
            }`}
          />
          {/* Extra ambient glow for standalone */}
          {standalone && (
            <div className="absolute top-[50%] left-[50%] -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full blur-[120px] opacity-10 bg-purple-500" />
          )}
        </div>

        {/* Main Content Container */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md relative z-10 flex flex-col gap-8"
        >
          {!isSuccess ? (
            <>
              {/* 1. Top Tag & Headline */}
              <div className="text-center space-y-4">
                {/* Brand Logo for standalone */}
                {standalone && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.1 }}
                    className="flex justify-center mb-2"
                  >
                    <BrandLogo size={48} />
                  </motion.div>
                )}

                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 backdrop-blur-md border border-white/20 shadow-lg">
                  <MapPin className="w-3 h-3 text-cyan-400" />
                  <span className="text-[11px] font-bold text-white/90 tracking-widest uppercase">
                    Atlanta Beta &bull; Midtown
                  </span>
                </div>

                <h1 className="text-4xl md:text-5xl font-bold text-white tracking-tight leading-[1.1]">
                  Know{' '}
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-cyan-400">
                    Before
                  </span>{' '}
                  You Go.
                </h1>

                <p className="text-[17px] text-white/70 max-w-sm mx-auto leading-relaxed">
                  Bytspot shows live crowd levels, parking availability, and ride options — all in one place.
                </p>

                <p className="text-[11px] font-medium text-white/30 uppercase tracking-widest">
                  Powered by live venue and parking data
                </p>
              </div>

              {/* 2. Visual Mock (Product Demo Card) */}
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.2 }}
                className="relative mx-4"
              >
                {/* Card Container */}
                <div className="relative rounded-2xl overflow-hidden backdrop-blur-xl border border-white/15 bg-[#1C1C1E]/60 shadow-2xl">
                  {/* Header Image Area (Simulated) */}
                  <div className="h-24 bg-gradient-to-br from-purple-900/40 to-black/40 flex items-end p-4 relative">
                    <div className="absolute inset-0 bg-gradient-to-t from-[#1C1C1E]/90 to-transparent" />
                    <div className="relative z-10 w-full flex justify-between items-end">
                      <div>
                        <h3 className="text-white font-bold text-lg">Midtown Venue</h3>
                        <div className="flex items-center gap-1 text-white/60 text-xs">
                          <MapPin className="w-3 h-3" />
                          <span>Atlanta, GA</span>
                        </div>
                      </div>
                      <div className="px-2 py-1 rounded-md bg-white/10 backdrop-blur-md border border-white/10">
                        <span className="text-xs font-medium text-emerald-400">Open Now</span>
                      </div>
                    </div>
                  </div>

                  {/* Content Body */}
                  <div className="p-4 space-y-4">
                    {/* Crowd Level Meter */}
                    <div className="space-y-2">
                      <div className="flex justify-between text-xs font-medium text-white/60 uppercase tracking-wide">
                        <div className="flex items-center gap-1.5">
                          <Users className="w-3.5 h-3.5" />
                          <span>Crowd Level</span>
                        </div>
                        <span className="text-orange-400">Active</span>
                      </div>
                      <div className="flex gap-1 h-2">
                        <div className="flex-1 rounded-full bg-cyan-500/20" />
                        <div className="flex-1 rounded-full bg-orange-500 shadow-[0_0_10px_rgba(249,115,22,0.5)]" />
                        <div className="flex-1 rounded-full bg-red-500/20" />
                      </div>
                      <div className="flex justify-between text-[10px] text-white/40">
                        <span>Chill</span>
                        <span>Active</span>
                        <span>Packed</span>
                      </div>
                      <div className="text-center pt-1">
                        <span className="text-[10px] text-white/60 font-medium">Busy but moving</span>
                      </div>
                    </div>

                    <div className="h-px bg-white/10" />

                    {/* Stats Grid */}
                    <div className="grid grid-cols-3 gap-2">
                      {/* Parking */}
                      <div className="flex flex-col items-center justify-center p-2 rounded-xl bg-white/5 border border-white/5 text-center">
                        <div className="bg-cyan-500/20 p-1.5 rounded-full mb-1.5">
                          <Car className="w-4 h-4 text-cyan-400" />
                        </div>
                        <span className="text-xs font-bold text-white">42</span>
                        <span className="text-[10px] text-white/50">Spots</span>
                      </div>

                      {/* Uber */}
                      <div className="flex flex-col items-center justify-center p-2 rounded-xl bg-white/5 border border-white/5 text-center">
                        <div className="bg-white/10 p-1.5 rounded-full mb-1.5">
                          <Clock className="w-4 h-4 text-white" />
                        </div>
                        <span className="text-xs font-bold text-white">6 min</span>
                        <span className="text-[10px] text-white/50">Uber ETA</span>
                      </div>

                      {/* Valet */}
                      <div className="flex flex-col items-center justify-center p-2 rounded-xl bg-white/5 border border-white/5 text-center">
                        <div className="bg-purple-500/20 p-1.5 rounded-full mb-1.5">
                          <KeyRound className="w-4 h-4 text-purple-400" />
                        </div>
                        <span className="text-xs font-bold text-purple-400">Yes</span>
                        <span className="text-[10px] text-white/50">Valet</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Decorative floating elements */}
                <div className="absolute -top-6 -right-6 w-20 h-20 bg-purple-500/30 rounded-full blur-2xl pointer-events-none" />
                <div className="absolute -bottom-6 -left-6 w-20 h-20 bg-cyan-500/30 rounded-full blur-2xl pointer-events-none" />
              </motion.div>

              {/* 3. Form & CTA */}
              <form onSubmit={handleSubmit} className="space-y-3">
                <div className="space-y-3">
                  {/* First Name Input */}
                  <div
                    className={`group relative rounded-xl transition-all duration-300 ${
                      isDarkMode
                        ? 'bg-white/5 border border-white/10 focus-within:bg-white/10 focus-within:border-white/20'
                        : 'bg-white/80 border border-black/10'
                    }`}
                  >
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="First name (optional)"
                      className="w-full bg-transparent p-4 text-white placeholder:text-white/30 focus:outline-none text-[16px]"
                      autoComplete="given-name"
                    />
                  </div>
                  {/* Email Input */}
                  <div
                    className={`group relative rounded-xl transition-all duration-300 ${
                      isDarkMode
                        ? 'bg-white/5 border border-white/10 focus-within:bg-white/10 focus-within:border-white/20'
                        : 'bg-white/80 border border-black/10'
                    }`}
                  >
                    <div className="absolute left-4 top-1/2 -translate-y-1/2">
                      <Mail className="w-5 h-5 text-white/40 group-focus-within:text-purple-400 transition-colors" />
                    </div>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="Enter your email"
                      className="w-full bg-transparent p-4 pl-12 text-white placeholder:text-white/30 focus:outline-none text-[16px]"
                      required
                      autoComplete="email"
                    />
                  </div>

                  <div className="flex items-center justify-center gap-2">
                    <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-red-500/10 border border-red-500/20">
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                      </span>
                      <span className="text-[10px] font-medium text-red-200">
                        Only {spotsLeft} Early Access spots left
                      </span>
                    </span>
                  </div>
                </div>

                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full relative overflow-hidden rounded-xl p-4 bg-gradient-to-r from-purple-600 to-cyan-600 text-white font-bold text-lg shadow-lg shadow-purple-500/25 disabled:opacity-70 disabled:cursor-not-allowed group"
                >
                  <div className="relative z-10 flex items-center justify-center gap-2">
                    {isSubmitting ? (
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <>
                        <span>Get Early Access</span>
                        <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                      </>
                    )}
                  </div>
                  {/* Shine effect */}
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:animate-[shimmer_1.5s_infinite]" />
                </motion.button>

                {/* Incentive & Trust */}
                <div className="text-center space-y-3 pt-2">
                  <p className="text-sm text-white/80 font-medium">
                    First 100 Midtown users get <span className="text-cyan-400">free parking credit</span> during beta.
                  </p>
                  <p className="text-[11px] text-white/30">Launching in select Midtown venues.</p>
                </div>


              </form>
            </>
          ) : (
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="text-center space-y-6 bg-white/5 backdrop-blur-xl p-8 rounded-3xl border border-white/10"
            >
              {/* Inbox icon */}
              <motion.div
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 260, damping: 20 }}
                className="w-20 h-20 bg-gradient-to-br from-purple-500 to-cyan-500 rounded-full mx-auto flex items-center justify-center shadow-lg shadow-purple-500/30"
              >
                <Mail className="w-10 h-10 text-white" strokeWidth={2} />
              </motion.div>

              <div className="space-y-2">
                <h2 className="text-2xl font-bold text-white">
                  {alreadySignedUp ? "You're already on the list!" : "Check your email! 📬"}
                </h2>
                <p className="text-white/70 leading-relaxed">
                  {alreadySignedUp
                    ? "We sent your early access link when you first signed up. Check your inbox!"
                    : <>We just sent your early access link to{' '}<span className="text-cyan-400 font-semibold">{localStorage.getItem('bytspot_beta_email') || 'your inbox'}</span>.<br />Open it to unlock the beta.</>
                  }
                </p>
              </div>

              {/* Spam hint */}
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.4 }}
                className="text-[12px] text-white/35 flex items-center justify-center gap-1.5"
              >
                <span>📁</span>
                <span>Don't see it? Check your spam folder.</span>
              </motion.p>

              {/* Share actions */}
              {(standalone || !onComplete) && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5 }}
                  className="pt-2"
                >
                  <p className="text-[12px] text-white/40 mb-3">Share with friends in Midtown</p>
                  <div className="flex flex-wrap items-center justify-center gap-3">
                    <button
                      onClick={() => {
                        const text = encodeURIComponent(
                          "I just got early access to Bytspot — live crowd levels, parking & ride options for Atlanta Midtown venues. Get yours:"
                        );
                        const url = encodeURIComponent(window.location.href);
                        window.open(`https://twitter.com/intent/tweet?text=${text}&url=${url}`, '_blank');
                      }}
                      className="min-h-[44px] px-5 py-2.5 rounded-lg bg-white/5 border border-white/10 text-white/70 text-[13px] hover:bg-white/10 transition-colors flex items-center gap-1.5"
                    >
                      Share on X
                      <ExternalLink className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(window.location.href);
                        toast.success('Link copied!');
                      }}
                      className="min-h-[44px] px-5 py-2.5 rounded-lg bg-white/5 border border-white/10 text-white/70 text-[13px] hover:bg-white/10 transition-colors"
                    >
                      Copy Link
                    </button>
                  </div>
                </motion.div>
              )}
            </motion.div>
          )}
        </motion.div>

        {/* Footer for standalone */}
        {standalone && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8 }}
            className="absolute bottom-6 left-0 right-0 text-center"
          >
            <p className="text-[11px] text-white/20">
              &copy; 2026 Bytspot &bull; Atlanta, GA
            </p>
          </motion.div>
        )}
      </div>
    </>
  );
}

/**
 * Standalone default export for separate hosting.
 * Use this as the default export in a standalone App.tsx:
 *
 *   import BetaSignupPage from './components/BetaSignup';
 *   export default BetaSignupPage;
 */
export default function BetaSignupPage() {
  return <BetaSignup standalone={true} />;
}