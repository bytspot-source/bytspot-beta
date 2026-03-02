import { motion, AnimatePresence } from 'motion/react';
import { Mail, Lock, User, Loader2, AlertCircle, KeyRound } from 'lucide-react';
import { useState } from 'react';
import { authApi } from '../utils/api';
import { toast } from 'sonner@2.0.3';

interface AuthenticationFlowProps {
  isDarkMode: boolean;
  onComplete: () => void;
}

type AuthMode = 'signup' | 'login';

export function AuthenticationFlow({ isDarkMode, onComplete }: AuthenticationFlowProps) {
  const [mode, setMode] = useState<AuthMode>('signup');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const springConfig = {
    type: "spring" as const,
    stiffness: 320,
    damping: 30,
    mass: 0.8,
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      // Validate invite code on signup (only if a code was entered or if it's required)
      if (mode === 'signup' && inviteCode.trim()) {
        const inv = await authApi.validateInvite(inviteCode.trim().toUpperCase());
        if (!inv.success || inv.data?.valid === false) {
          setError(inv.data?.error || 'Invalid invite code. Check your code and try again.');
          setLoading(false);
          return;
        }
      }

      const res = mode === 'signup'
        ? await authApi.signup(email.trim(), password, name.trim())
        : await authApi.login(email.trim(), password);

      if (res.success && res.data?.token) {
        localStorage.setItem('bytspot_auth_token', res.data.token);
        localStorage.setItem('bytspot_user', JSON.stringify(res.data.user));
        if (res.data.user?.name) {
          localStorage.setItem('bytspot_user_name', res.data.user.name.split(' ')[0]);
        }
        toast.success(mode === 'signup' ? 'Welcome to Bytspot! 🎉' : 'Welcome back!');
        onComplete();
      } else {
        setError(res.error?.message || 'Something went wrong. Please try again.');
      }
    } catch {
      setError('Connection error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Beta guest bypass — no OAuth needed for now
  const handleGuestContinue = () => {
    localStorage.setItem('bytspot_auth_token', 'beta_guest');
    onComplete();
  };

  return (
    <div className="min-h-screen overflow-hidden bg-[#000000]">
      {/* Background gradients */}
      <div className="absolute inset-0">
        <div className="absolute inset-0 bg-[#000000]" />
        <div className="absolute inset-0 opacity-30 pointer-events-none">
          <div className="absolute top-[20%] left-1/2 -translate-x-1/2 w-[600px] h-[600px]" 
               style={{ background: 'radial-gradient(circle, rgba(168, 85, 247, 0.25) 0%, transparent 70%)' }} />
          <div className="absolute bottom-[10%] left-1/2 -translate-x-1/2 w-[500px] h-[500px]" 
               style={{ background: 'radial-gradient(circle, rgba(0, 191, 255, 0.2) 0%, transparent 70%)' }} />
        </div>
      </div>

      <div className="relative max-w-[393px] mx-auto min-h-screen flex flex-col px-6 py-12 justify-center">

        {/* Logo + heading */}
        <motion.div
          className="text-center mb-10"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={springConfig}
        >
          <div className="w-20 h-20 rounded-[24px] bg-gradient-to-br from-purple-500 via-pink-500 to-cyan-500 flex items-center justify-center mx-auto mb-5 shadow-xl">
            <span className="text-[36px]">👋</span>
          </div>
          <h1 className="text-large-title text-white mb-2">Welcome to Bytspot</h1>
          <p className="text-[15px] text-white/60" style={{ fontWeight: 400 }}>Midtown Atlanta, know before you go</p>
        </motion.div>

        {/* Mode toggle */}
        <motion.div
          className="flex rounded-[14px] bg-white/10 p-1 mb-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ ...springConfig, delay: 0.1 }}
        >
          {(['signup', 'login'] as AuthMode[]).map((m) => (
            <button
              key={m}
              onClick={() => { setMode(m); setError(''); }}
              className={`flex-1 py-2.5 rounded-[10px] text-[15px] transition-all ${
                mode === m ? 'bg-white text-black shadow' : 'text-white/60'
              }`}
              style={{ fontWeight: 600 }}
            >
              {m === 'signup' ? 'Sign Up' : 'Log In'}
            </button>
          ))}
        </motion.div>

        {/* Form */}
        <motion.form
          onSubmit={handleSubmit}
          className="space-y-3"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ ...springConfig, delay: 0.15 }}
        >
          <AnimatePresence>
            {mode === 'signup' && (
              <>
                <motion.div
                  key="name"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <div className="flex items-center gap-3 px-4 py-3.5 rounded-[14px] border-2 border-white/20 bg-[#1C1C1E]/80 backdrop-blur-xl">
                    <User className="w-5 h-5 text-white/40 flex-shrink-0" strokeWidth={2} />
                    <input
                      type="text"
                      placeholder="Full name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required={mode === 'signup'}
                      className="flex-1 bg-transparent text-[17px] text-white placeholder:text-white/40 outline-none"
                    />
                  </div>
                </motion.div>
                <motion.div
                  key="invite"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2, delay: 0.05 }}
                >
                  <div className={`flex items-center gap-3 px-4 py-3.5 rounded-[14px] border-2 backdrop-blur-xl ${inviteCode ? 'border-purple-400/50 bg-purple-500/10' : 'border-white/10 bg-[#1C1C1E]/50'}`}>
                    <KeyRound className={`w-5 h-5 flex-shrink-0 ${inviteCode ? 'text-purple-400' : 'text-white/25'}`} strokeWidth={2} />
                    <input
                      type="text"
                      placeholder="Invite code (optional)"
                      value={inviteCode}
                      onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                      maxLength={10}
                      className="flex-1 bg-transparent text-[17px] text-white placeholder:text-white/30 outline-none tracking-widest"
                      style={{ fontFamily: 'monospace' }}
                    />
                  </div>
                </motion.div>
              </>
            )}
          </AnimatePresence>

          <div className="flex items-center gap-3 px-4 py-3.5 rounded-[14px] border-2 border-white/20 bg-[#1C1C1E]/80 backdrop-blur-xl">
            <Mail className="w-5 h-5 text-white/40 flex-shrink-0" strokeWidth={2} />
            <input
              type="email"
              placeholder="Email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="flex-1 bg-transparent text-[17px] text-white placeholder:text-white/40 outline-none"
            />
          </div>

          <div className="flex items-center gap-3 px-4 py-3.5 rounded-[14px] border-2 border-white/20 bg-[#1C1C1E]/80 backdrop-blur-xl">
            <Lock className="w-5 h-5 text-white/40 flex-shrink-0" strokeWidth={2} />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className="flex-1 bg-transparent text-[17px] text-white placeholder:text-white/40 outline-none"
            />
          </div>

          {/* Error */}
          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="flex items-center gap-2 px-4 py-3 rounded-[12px] bg-red-500/15 border border-red-400/30"
              >
                <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                <p className="text-[13px] text-red-300" style={{ fontWeight: 500 }}>{error}</p>
              </motion.div>
            )}
          </AnimatePresence>

          <motion.button
            type="submit"
            disabled={loading}
            className="w-full py-4 rounded-[16px] bg-gradient-to-r from-purple-500 to-cyan-500 text-white flex items-center justify-center gap-2 shadow-lg disabled:opacity-60"
            style={{ fontWeight: 600, fontSize: 17 }}
            whileTap={{ scale: loading ? 1 : 0.98 }}
            transition={springConfig}
          >
            {loading
              ? <Loader2 className="w-5 h-5 animate-spin" />
              : mode === 'signup' ? 'Create Account' : 'Log In'
            }
          </motion.button>
        </motion.form>

        {/* Divider */}
        <div className="flex items-center gap-3 my-5">
          <div className="flex-1 h-px bg-white/10" />
          <span className="text-[12px] text-white/30" style={{ fontWeight: 500 }}>or</span>
          <div className="flex-1 h-px bg-white/10" />
        </div>

        {/* Beta guest bypass */}
        <motion.button
          onClick={handleGuestContinue}
          className="w-full py-3.5 rounded-[16px] border-2 border-white/20 text-white/60 text-[15px]"
          style={{ fontWeight: 500 }}
          whileTap={{ scale: 0.98 }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ ...springConfig, delay: 0.3 }}
        >
          Continue as Guest
        </motion.button>

        <p className="text-[11px] text-white/25 text-center mt-6" style={{ fontWeight: 400 }}>
          By continuing, you agree to our Terms of Service and Privacy Policy
        </p>
      </div>
    </div>
  );
}