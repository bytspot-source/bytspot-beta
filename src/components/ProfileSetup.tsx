import { motion } from 'motion/react';
import { User, Camera, ChevronRight } from 'lucide-react';
import { useState } from 'react';

interface ProfileSetupProps {
  isDarkMode: boolean;
  onComplete: () => void;
}

export function ProfileSetup({ isDarkMode, onComplete }: ProfileSetupProps) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [hasAvatar, setHasAvatar] = useState(false);

  const springConfig = {
    type: "spring" as const,
    stiffness: 320,
    damping: 30,
    mass: 0.8,
  };

  const handleAvatarUpload = () => {
    // Mock avatar upload
    setHasAvatar(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim() && email.trim()) {
      // Mock profile creation with JWT token storage
      const mockToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.mocktoken';
      localStorage.setItem('bytspot_auth_token', mockToken);
      localStorage.setItem('bytspot_user', JSON.stringify({ name, email, hasAvatar }));
      onComplete();
    }
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

      <div className="relative max-w-[393px] mx-auto min-h-screen flex flex-col px-6 py-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={springConfig}
          className="flex-1 flex flex-col justify-center"
        >
          <div className="text-center mb-12">
            <motion.h1
              className="text-large-title mb-4 text-white"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.1 }}
            >
              Create Your Profile
            </motion.h1>

            <motion.p
              className="text-[17px] text-white/90"
              style={{ fontWeight: 400 }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2 }}
            >
              Tell us a bit about yourself
            </motion.p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Avatar Upload */}
            <motion.div
              className="flex justify-center mb-8"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.3 }}
            >
              <button
                type="button"
                onClick={handleAvatarUpload}
                className="relative group"
              >
                <div className={`w-28 h-28 rounded-full flex items-center justify-center border-2 transition-all ${
                  hasAvatar 
                    ? 'bg-gradient-to-br from-purple-500 to-cyan-500 border-white/30' 
                    : 'bg-[#1C1C1E]/80 border-white/30 backdrop-blur-xl'
                }`}>
                  {hasAvatar ? (
                    <span className="text-[48px]">👤</span>
                  ) : (
                    <User className="w-12 h-12 text-white/50" strokeWidth={2} />
                  )}
                </div>
                <motion.div
                  className="absolute bottom-0 right-0 w-10 h-10 rounded-full bg-cyan-500 border-2 border-[#000000] flex items-center justify-center shadow-lg"
                  whileTap={{ scale: 0.9 }}
                  transition={springConfig}
                >
                  <Camera className="w-5 h-5 text-white" strokeWidth={2.5} />
                </motion.div>
              </button>
            </motion.div>

            {/* Name Input */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
            >
              <label className="block text-[13px] mb-2 px-1 text-white" style={{ fontWeight: 500 }}>
                Full Name
              </label>
              <div className="rounded-[16px] border-2 border-white/30 bg-[#1C1C1E]/80 backdrop-blur-xl shadow-xl">
                <div className="flex items-center gap-3 p-4">
                  <User className="w-5 h-5 text-purple-400 flex-shrink-0" strokeWidth={2.5} />
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="John Doe"
                    className="flex-1 bg-transparent text-[17px] outline-none text-white placeholder:text-white/60"
                    style={{ fontWeight: 400 }}
                    autoFocus
                  />
                </div>
              </div>
            </motion.div>

            {/* Email Input */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
            >
              <label className="block text-[13px] mb-2 px-1 text-white" style={{ fontWeight: 500 }}>
                Email Address
              </label>
              <div className="rounded-[16px] border-2 border-white/30 bg-[#1C1C1E]/80 backdrop-blur-xl shadow-xl">
                <div className="flex items-center gap-3 p-4">
                  <span className="text-[17px] text-purple-400 flex-shrink-0">@</span>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="john@example.com"
                    className="flex-1 bg-transparent text-[17px] outline-none text-white placeholder:text-white/60"
                    style={{ fontWeight: 400 }}
                  />
                </div>
              </div>
            </motion.div>

            {/* Info Card */}
            <motion.div
              className="rounded-[16px] p-4 border-2 border-blue-400/30 bg-blue-500/10 backdrop-blur-xl"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.6 }}
            >
              <p className="text-[13px] text-blue-400" style={{ fontWeight: 500 }}>
                🔒 Your information is encrypted and stored securely using industry-standard JWT tokens
              </p>
            </motion.div>

            {/* Submit Button */}
            <motion.button
              type="submit"
              disabled={!name.trim() || !email.trim()}
              className={`w-full rounded-[16px] p-4 flex items-center justify-center gap-2 transition-all ${
                name.trim() && email.trim()
                  ? 'bg-gradient-to-br from-purple-500 to-pink-500 shadow-lg shadow-purple-500/25'
                  : 'bg-white/10'
              }`}
              whileTap={{ scale: name.trim() && email.trim() ? 0.98 : 1 }}
              transition={springConfig}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              style={{ transitionDelay: '0.7s' }}
            >
              <span className={`text-[17px] ${
                name.trim() && email.trim() ? 'text-white' : 'text-white/40'
              }`} style={{ fontWeight: 600 }}>
                Complete Setup
              </span>
              <ChevronRight className={`w-5 h-5 ${
                name.trim() && email.trim() ? 'text-white' : 'text-white/40'
              }`} strokeWidth={2.5} />
            </motion.button>

            <motion.button
              type="button"
              onClick={onComplete}
              className="w-full mt-3 p-3 text-[15px] text-white/70"
              style={{ fontWeight: 500 }}
              whileTap={{ scale: 0.98 }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.8 }}
            >
              Skip for now
            </motion.button>
          </form>
        </motion.div>
      </div>
    </div>
  );
}
