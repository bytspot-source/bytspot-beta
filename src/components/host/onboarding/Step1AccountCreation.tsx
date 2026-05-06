import { useState } from 'react';
import { motion } from 'motion/react';
import { Mail, Lock, Phone, Eye, EyeOff, Chrome } from 'lucide-react';
import { trpc } from '../../../utils/trpc';
import type { OnboardingData } from '../HostOnboarding';

interface Step1AccountCreationProps {
  onComplete: (data: Partial<OnboardingData>) => void;
  initialValue?: {
    email: string;
    phone: string;
    password: string;
  };
}

export function Step1AccountCreation({ onComplete, initialValue }: Step1AccountCreationProps) {
  const [email, setEmail] = useState(initialValue?.email || '');
  const [phone, setPhone] = useState(initialValue?.phone || '');
  const [password, setPassword] = useState(initialValue?.password || '');
  const [showPassword, setShowPassword] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const springConfig = {
    type: "spring" as const,
    stiffness: 320,
    damping: 30,
    mass: 0.8,
  };

  const isValid = () => {
    return (
      email.includes('@') &&
      phone.length >= 10 &&
      password.length >= 8 &&
      termsAccepted
    );
  };

  const persistAuth = (res: any) => {
    if (!res?.token) throw new Error('Authentication did not return a session token.');
    localStorage.setItem('bytspot_auth_token', res.token);
    localStorage.setItem('bytspot_user', JSON.stringify(res.user ?? { email: email.trim() }));
    const displayName = res.user?.name || email.trim().split('@')[0];
    if (displayName) localStorage.setItem('bytspot_user_name', displayName.split(' ')[0]);
  };

  const handleContinue = async () => {
    if (!isValid() || isSubmitting) return;

    setIsSubmitting(true);
    setError(null);
    try {
      try {
        const signup = await trpc.auth.signup.mutate({
          email: email.trim(),
          password,
          name: email.trim().split('@')[0] || 'Bytspot Provider',
          ref: 'provider-onboarding',
        });
        persistAuth(signup);
      } catch (signupErr: any) {
        if (!String(signupErr?.message || '').toLowerCase().includes('already registered')) {
          throw signupErr;
        }
        const login = await trpc.auth.login.mutate({ email: email.trim(), password });
        persistAuth(login);
      }

      onComplete({ account: { email, phone, password } });
    } catch (err: any) {
      setError(err?.message || 'Unable to create or sign in to your account. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleSignup = () => {
    setError('Google sign-up is not enabled yet. Please create your Provider account with email and password.');
  };

  return (
    <div className="max-w-[800px] mx-auto px-4">
      {/* Header */}
      <motion.div
        className="text-center mb-8"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={springConfig}
      >
        <h1 className="text-large-title text-white mb-3">
          Create Your Account
        </h1>
        <p className="text-[17px] text-white/70" style={{ fontWeight: 400 }}>
          Welcome to Bytspot Host! Let's get started
        </p>
      </motion.div>

      {/* Google Sign Up */}
      <motion.button
        onClick={handleGoogleSignup}
        className="w-full mb-6 rounded-[20px] p-4 border-2 border-white/30 bg-white/10 backdrop-blur-xl hover:bg-white/15 flex items-center justify-center gap-3"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...springConfig, delay: 0.1 }}
        whileTap={{ scale: 0.98 }}
      >
        <Chrome className="w-5 h-5 text-white" strokeWidth={2.5} />
        <span className="text-[17px] text-white" style={{ fontWeight: 600 }}>
          Google sign-up coming soon
        </span>
      </motion.button>

      {/* Divider */}
      <motion.div
        className="flex items-center gap-4 mb-6"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
      >
        <div className="flex-1 h-px bg-white/20" />
        <span className="text-[13px] text-white/60" style={{ fontWeight: 500 }}>
          OR
        </span>
        <div className="flex-1 h-px bg-white/20" />
      </motion.div>

      {/* Form Fields */}
      <div className="space-y-4 mb-6">
        {/* Email */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...springConfig, delay: 0.3 }}
        >
          <label className="block text-[15px] text-white mb-2" style={{ fontWeight: 600 }}>
            Email Address
          </label>
          <div className="relative">
            <div className="absolute left-4 top-1/2 -translate-y-1/2">
              <Mail className="w-5 h-5 text-white/60" strokeWidth={2.5} />
            </div>
            <input
              data-testid="provider-account-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              className="w-full pl-12 pr-4 py-3.5 rounded-[16px] border-2 border-white/30 bg-[#1C1C1E]/80 backdrop-blur-xl text-white placeholder:text-white/50 outline-none focus:border-purple-500/50 transition-colors"
              style={{ fontSize: '17px', fontWeight: 400 }}
            />
          </div>
        </motion.div>

        {/* Phone */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...springConfig, delay: 0.35 }}
        >
          <label className="block text-[15px] text-white mb-2" style={{ fontWeight: 600 }}>
            Phone Number
          </label>
          <div className="relative">
            <div className="absolute left-4 top-1/2 -translate-y-1/2">
              <Phone className="w-5 h-5 text-white/60" strokeWidth={2.5} />
            </div>
            <input
              data-testid="provider-account-phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="(555) 123-4567"
              className="w-full pl-12 pr-4 py-3.5 rounded-[16px] border-2 border-white/30 bg-[#1C1C1E]/80 backdrop-blur-xl text-white placeholder:text-white/50 outline-none focus:border-purple-500/50 transition-colors"
              style={{ fontSize: '17px', fontWeight: 400 }}
            />
          </div>
        </motion.div>

        {/* Password */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...springConfig, delay: 0.4 }}
        >
          <label className="block text-[15px] text-white mb-2" style={{ fontWeight: 600 }}>
            Password
          </label>
          <div className="relative">
            <div className="absolute left-4 top-1/2 -translate-y-1/2">
              <Lock className="w-5 h-5 text-white/60" strokeWidth={2.5} />
            </div>
            <input
              data-testid="provider-account-password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Min. 8 characters"
              className="w-full pl-12 pr-12 py-3.5 rounded-[16px] border-2 border-white/30 bg-[#1C1C1E]/80 backdrop-blur-xl text-white placeholder:text-white/50 outline-none focus:border-purple-500/50 transition-colors"
              style={{ fontSize: '17px', fontWeight: 400 }}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-4 top-1/2 -translate-y-1/2"
            >
              {showPassword ? (
                <EyeOff className="w-5 h-5 text-white/60" strokeWidth={2.5} />
              ) : (
                <Eye className="w-5 h-5 text-white/60" strokeWidth={2.5} />
              )}
            </button>
          </div>
          {password.length > 0 && password.length < 8 && (
            <p className="text-[13px] text-orange-400 mt-2" style={{ fontWeight: 400 }}>
              Password must be at least 8 characters
            </p>
          )}
        </motion.div>
      </div>

      {error && (
        <p className="mb-4 rounded-2xl border border-red-400/30 bg-red-500/10 p-3 text-[13px] text-red-100" role="alert" style={{ fontWeight: 650 }}>
          {error}
        </p>
      )}

      {/* Terms & Conditions */}
      <motion.div
        className="mb-8"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...springConfig, delay: 0.45 }}
      >
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            data-testid="provider-account-terms"
            type="checkbox"
            checked={termsAccepted}
            onChange={(e) => setTermsAccepted(e.target.checked)}
            className="mt-1 w-5 h-5 rounded border-2 border-white/30 bg-[#1C1C1E]/80 checked:bg-gradient-to-br checked:from-purple-500 checked:to-cyan-500 cursor-pointer"
          />
          <span className="text-[15px] text-white/80 leading-relaxed" style={{ fontWeight: 400 }}>
            I agree to the{' '}
            <span className="text-purple-400" style={{ fontWeight: 600 }}>
              Terms of Service
            </span>{' '}
            and{' '}
            <span className="text-purple-400" style={{ fontWeight: 600 }}>
              Privacy Policy
            </span>
          </span>
        </label>
      </motion.div>

      {/* Continue Button */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...springConfig, delay: 0.5 }}
      >
        <motion.button
          data-testid="provider-onboarding-continue"
          onClick={handleContinue}
          disabled={!isValid() || isSubmitting}
          className={`w-full py-4 rounded-full shadow-xl transition-all ${
            isValid() && !isSubmitting
              ? 'bg-gradient-to-r from-purple-500 to-cyan-500 text-white cursor-pointer'
              : 'bg-white/20 text-white/50 cursor-not-allowed'
          }`}
          whileTap={isValid() && !isSubmitting ? { scale: 0.98 } : {}}
          whileHover={isValid() && !isSubmitting ? { scale: 1.02 } : {}}
        >
          <span className="text-[17px]" style={{ fontWeight: 600 }}>
            {isSubmitting ? 'Creating account…' : 'Continue'}
          </span>
        </motion.button>
      </motion.div>

      {/* Already have account */}
      <motion.div
        className="text-center mt-6"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.6 }}
      >
        <p className="text-[15px] text-white/70" style={{ fontWeight: 400 }}>
          Already have an account?{' '}
          <button className="text-purple-400" style={{ fontWeight: 600 }}>
            Sign In
          </button>
        </p>
      </motion.div>
    </div>
  );
}
