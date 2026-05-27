import { useState } from 'react';
import { motion } from 'motion/react';
import { AlertCircle, Mail, Lock, Phone, Eye, EyeOff } from 'lucide-react';
import { trpc } from '../../../utils/trpc';
import type { OnboardingData } from '../ProviderOnboarding';
import { GoogleSignInButton } from '../../GoogleSignInButton';
import { AppleSignInButton } from '../../AppleSignInButton';

interface Step1AccountCreationProps {
  onComplete: (data: Partial<OnboardingData>) => void;
  initialValue?: {
    email: string;
    phone: string;
    password: string;
  };
}

export function Step1AccountCreation({ onComplete, initialValue }: Step1AccountCreationProps) {
  const [authMode, setAuthMode] = useState<'signup' | 'signin'>('signup');
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

  const isSignup = authMode === 'signup';
  const emailIsValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const phoneIsValid = phone.replace(/\D/g, '').length >= 10;
  const passwordIsValid = password.length >= 8;

  const isValid = () => {
    if (!emailIsValid || !passwordIsValid) return false;
    if (!isSignup) return true;
    return phoneIsValid && termsAccepted;
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
      if (isSignup) {
        try {
          const signup = await trpc.auth.signup.mutate({
            email: email.trim(),
            password,
            name: email.trim().split('@')[0] || 'Bytspot Provider',
            ref: 'provider-onboarding',
          });
          persistAuth(signup);
        } catch (signupErr: any) {
          const message = String(signupErr?.message || '').toLowerCase();
          const accountExists = message.includes('already registered') || message.includes('already exists') || message.includes('conflict');
          if (!accountExists) throw signupErr;
          const login = await trpc.auth.login.mutate({ email: email.trim(), password });
          persistAuth(login);
        }
      } else {
        const login = await trpc.auth.login.mutate({ email: email.trim(), password });
        persistAuth(login);
      }

      onComplete({ account: { email, phone, password } });
    } catch (err: any) {
      setError(err?.message || (isSignup ? 'Unable to create your Provider account. Please try again.' : 'Unable to sign in. Check your email and password.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleCredential = async (idToken: string) => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const res = await trpc.auth.googleSignIn.mutate({ idToken, ref: 'provider-onboarding', surface: 'provider-onboarding' });
      persistAuth(res);
      const accountEmail = res.user?.email ?? email.trim();
      setEmail(accountEmail);
      onComplete({ account: { email: accountEmail, phone, password: '' } });
    } catch (err: any) {
      setError(err?.message || 'Google sign-in failed. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAppleCredential = async ({ identityToken, email: appleEmail, name }: { identityToken: string; email?: string; name?: string }) => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const res = await trpc.auth.appleSignIn.mutate({ identityToken, email: appleEmail, name, ref: 'provider-onboarding' });
      persistAuth(res);
      const accountEmail = res.user?.email ?? appleEmail ?? email.trim();
      setEmail(accountEmail);
      onComplete({ account: { email: accountEmail, phone, password: '' } });
    } catch (err: any) {
      setError(err?.message || 'Sign in with Apple failed. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
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
          {isSignup ? 'Create your Provider account' : 'Sign in to Provider account'}
        </h1>
        <p className="text-[17px] text-white/70" style={{ fontWeight: 400 }}>
          {isSignup ? 'Use Apple, Google, or email to create a secure account before business setup.' : 'Continue onboarding with your existing Provider business account.'}
        </p>
      </motion.div>

      <motion.div
        className="mb-6 grid grid-cols-2 gap-2 rounded-[18px] border border-white/20 bg-white/10 p-1"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...springConfig, delay: 0.08 }}
      >
        <button
          type="button"
          data-testid="provider-account-mode-signup"
          onClick={() => { setAuthMode('signup'); setError(null); }}
          className={`rounded-[14px] px-3 py-2.5 text-[14px] transition ${isSignup ? 'bg-white text-black shadow-lg' : 'text-white/75 hover:bg-white/10'}`}
          style={{ fontWeight: 800 }}
        >
          Sign up
        </button>
        <button
          type="button"
          data-testid="provider-account-mode-signin"
          onClick={() => { setAuthMode('signin'); setError(null); }}
          className={`rounded-[14px] px-3 py-2.5 text-[14px] transition ${!isSignup ? 'bg-white text-black shadow-lg' : 'text-white/75 hover:bg-white/10'}`}
          style={{ fontWeight: 800 }}
        >
          Sign in
        </button>
      </motion.div>

		      {/* Third-party sign in options */}
      <motion.div
		        className="w-full mb-6 space-y-3 rounded-[20px] border-2 border-white/30 bg-white/10 p-4 backdrop-blur-xl"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...springConfig, delay: 0.1 }}
      >
		        <div>
		          <p className="text-[13px] text-white" style={{ fontWeight: 800 }}>Recommended</p>
		          <p className="text-[12px] text-white/55">Apple keeps setup fast and supports Hide My Email.</p>
		        </div>
	        <AppleSignInButton
		          appearance="white"
		          label="continue"
	          disabled={isSubmitting}
	          onCredential={handleAppleCredential}
	          onError={(message) => setError(message)}
	        />
        <GoogleSignInButton
          label="Continue Provider onboarding with Google"
          disabled={isSubmitting}
          onCredential={handleGoogleCredential}
          onError={(message) => setError(message)}
        />
      </motion.div>

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
              className={`w-full pl-12 pr-4 py-3.5 rounded-[16px] border-2 bg-[#1C1C1E]/80 backdrop-blur-xl text-white placeholder:text-white/50 outline-none transition-colors ${email ? emailIsValid ? 'border-emerald-400/40 focus:border-emerald-300/70' : 'border-orange-400/50 focus:border-orange-300/70' : 'border-white/30 focus:border-purple-500/50'}`}
              style={{ fontSize: '17px', fontWeight: 400 }}
            />
          </div>
          {email.length > 0 && !emailIsValid && (
            <p className="mt-2 text-[13px] text-orange-300" style={{ fontWeight: 600 }}>Enter a valid email address.</p>
          )}
        </motion.div>

        {isSignup && (
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
                className={`w-full pl-12 pr-4 py-3.5 rounded-[16px] border-2 bg-[#1C1C1E]/80 backdrop-blur-xl text-white placeholder:text-white/50 outline-none transition-colors ${phone ? phoneIsValid ? 'border-emerald-400/40 focus:border-emerald-300/70' : 'border-orange-400/50 focus:border-orange-300/70' : 'border-white/30 focus:border-purple-500/50'}`}
                style={{ fontSize: '17px', fontWeight: 400 }}
              />
            </div>
            {phone.length > 0 && !phoneIsValid && (
              <p className="mt-2 text-[13px] text-orange-300" style={{ fontWeight: 600 }}>Enter a phone number with at least 10 digits.</p>
            )}
          </motion.div>
        )}

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
              className={`w-full pl-12 pr-12 py-3.5 rounded-[16px] border-2 bg-[#1C1C1E]/80 backdrop-blur-xl text-white placeholder:text-white/50 outline-none transition-colors ${password ? passwordIsValid ? 'border-emerald-400/40 focus:border-emerald-300/70' : 'border-orange-400/50 focus:border-orange-300/70' : 'border-white/30 focus:border-purple-500/50'}`}
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
          {password.length > 0 && !passwordIsValid && (
            <p className="text-[13px] text-orange-400 mt-2" style={{ fontWeight: 400 }}>
              Password must be at least 8 characters
            </p>
          )}
        </motion.div>
      </div>

      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-2xl border border-red-400/30 bg-red-500/10 p-3 text-[13px] text-red-100" role="alert" style={{ fontWeight: 650 }}>
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-200" />
          <p>{error}</p>
        </div>
      )}

      {isSignup && (
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
      )}

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
            {isSubmitting ? (isSignup ? 'Creating account…' : 'Signing in…') : (isSignup ? 'Create account and continue' : 'Sign in and continue')}
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
          {isSignup ? 'Already have an account?' : 'Need a Provider account?'}{' '}
          <button
            type="button"
            data-testid="provider-account-toggle-mode"
            onClick={() => { setAuthMode(isSignup ? 'signin' : 'signup'); setError(null); }}
            className="text-purple-400"
            style={{ fontWeight: 600 }}
          >
            {isSignup ? 'Sign In' : 'Sign up'}
          </button>
        </p>
      </motion.div>
    </div>
  );
}
