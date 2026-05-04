import { FormEvent, useState } from 'react';
import { motion } from 'motion/react';
import { AlertCircle, ArrowLeft, CheckCircle2, Loader2, Lock, Mail } from 'lucide-react';
import { toast } from 'sonner@2.0.3';
import {
  getPasswordResetTokenFromLocation,
  requestPasswordReset,
  resetPassword,
} from '../utils/passwordRecovery';

type PasswordRecoveryMode = 'forgot' | 'reset';

interface PasswordRecoveryScreenProps {
  mode: PasswordRecoveryMode;
  onBackToAuth: () => void;
}

const springConfig = { type: 'spring' as const, stiffness: 320, damping: 30, mass: 0.8 };

export function PasswordRecoveryScreen({ mode, onBackToAuth }: PasswordRecoveryScreenProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const token = mode === 'reset' && typeof window !== 'undefined'
    ? getPasswordResetTokenFromLocation(window.location)
    : '';
  const isReset = mode === 'reset';
  const title = isReset ? 'Reset your password' : 'Forgot your password?';
  const subtitle = isReset
    ? 'Create a new password for your Bytspot account.'
    : "Enter your email and we'll send a secure reset link if an account exists.";

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setMessage('');

    if (isReset && password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    if (isReset && !token) {
      setError('This reset link is missing a token. Request a new password reset email.');
      return;
    }

    setLoading(true);
    try {
      if (isReset) {
        await resetPassword(token, password);
        setMessage('Your password has been reset. You can now log in with your new password.');
        toast.success('Password reset complete');
      } else {
        await requestPasswordReset(email);
        setMessage('If an account exists for that email, a reset link has been sent.');
        toast.success('Check your email', { description: 'Your reset link will expire in 1 hour.' });
      }
    } catch (err: any) {
      setError(err?.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen overflow-hidden bg-black text-white">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute inset-0 bg-black" />
        <div className="absolute left-1/2 top-[20%] h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-purple-500/20 blur-[120px]" />
        <div className="absolute bottom-[10%] left-1/2 h-[420px] w-[420px] -translate-x-1/2 rounded-full bg-cyan-500/15 blur-[120px]" />
      </div>

      <main className="relative mx-auto flex min-h-screen max-w-[393px] flex-col justify-center px-6 py-12">
        <button
          type="button"
          onClick={onBackToAuth}
          className="mb-8 inline-flex w-fit items-center gap-2 rounded-full border border-white/15 px-4 py-2 text-sm text-white/70 transition hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-cyan-300"
          data-testid="password-recovery-back"
        >
          <ArrowLeft className="h-4 w-4" /> Back to login
        </button>

        <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={springConfig}>
          <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-[22px] bg-gradient-to-br from-purple-500 via-pink-500 to-cyan-500 shadow-xl">
            {isReset ? <Lock className="h-8 w-8" /> : <Mail className="h-8 w-8" />}
          </div>
          <h1 className="mb-2 text-[34px] font-semibold leading-tight tracking-[-0.03em]">{title}</h1>
          <p className="mb-8 text-[15px] leading-6 text-white/60">{subtitle}</p>
        </motion.div>

        <form onSubmit={handleSubmit} className="space-y-3" data-testid="password-recovery-form">
          {!isReset ? (
            <label className="block rounded-[14px] border-2 border-white/20 bg-[#1C1C1E]/80 px-4 py-3.5 backdrop-blur-xl">
              <span className="sr-only">Email address</span>
              <input
                type="email"
                placeholder="Email address"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                className="w-full bg-transparent text-[17px] text-white outline-none placeholder:text-white/40"
              />
            </label>
          ) : (
            <>
              <label className="block rounded-[14px] border-2 border-white/20 bg-[#1C1C1E]/80 px-4 py-3.5 backdrop-blur-xl">
                <span className="sr-only">New password</span>
                <input type="password" placeholder="New password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} className="w-full bg-transparent text-[17px] text-white outline-none placeholder:text-white/40" />
              </label>
              <label className="block rounded-[14px] border-2 border-white/20 bg-[#1C1C1E]/80 px-4 py-3.5 backdrop-blur-xl">
                <span className="sr-only">Confirm new password</span>
                <input type="password" placeholder="Confirm new password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required minLength={8} className="w-full bg-transparent text-[17px] text-white outline-none placeholder:text-white/40" />
              </label>
            </>
          )}

          {message && <p role="status" className="flex gap-2 rounded-xl border border-emerald-400/30 bg-emerald-500/15 px-4 py-3 text-sm text-emerald-200"><CheckCircle2 className="h-4 w-4 flex-shrink-0" />{message}</p>}
          {error && <p role="alert" className="flex gap-2 rounded-xl border border-red-400/30 bg-red-500/15 px-4 py-3 text-sm text-red-200"><AlertCircle className="h-4 w-4 flex-shrink-0" />{error}</p>}

          <button type="submit" disabled={loading} className="flex w-full items-center justify-center gap-2 rounded-[16px] bg-gradient-to-r from-purple-500 to-cyan-500 py-4 text-[17px] font-semibold text-white shadow-lg disabled:opacity-60" data-testid="password-recovery-submit">
            {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : isReset ? 'Reset Password' : 'Send Reset Link'}
          </button>
        </form>
      </main>
    </div>
  );
}
