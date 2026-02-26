import { motion, AnimatePresence } from 'motion/react';
import { Phone, Mail, ChevronRight, Check, ArrowLeft } from 'lucide-react';
import { useState } from 'react';

interface AuthenticationFlowProps {
  isDarkMode: boolean;
  onComplete: () => void;
}

type AuthStep = 'method' | 'phone' | 'code';

export function AuthenticationFlow({ isDarkMode, onComplete }: AuthenticationFlowProps) {
  const [currentStep, setCurrentStep] = useState<AuthStep>('method');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [verificationCode, setVerificationCode] = useState(['', '', '', '', '', '']);
  const [isVerifying, setIsVerifying] = useState(false);

  const springConfig = {
    type: "spring" as const,
    stiffness: 320,
    damping: 30,
    mass: 0.8,
  };

  const handlePhoneSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (phoneNumber.length >= 10) {
      setCurrentStep('code');
    }
  };

  const handleCodeChange = (index: number, value: string) => {
    if (value.length > 1) return;
    
    const newCode = [...verificationCode];
    newCode[index] = value;
    setVerificationCode(newCode);

    // Auto-focus next input
    if (value && index < 5) {
      const nextInput = document.getElementById(`code-${index + 1}`);
      nextInput?.focus();
    }

    // Auto-verify when all digits entered
    if (index === 5 && value && newCode.every(digit => digit)) {
      handleVerify(newCode);
    }
  };

  const handleVerify = (code: string[]) => {
    setIsVerifying(true);
    // Mock verification
    setTimeout(() => {
      setIsVerifying(false);
      onComplete();
    }, 1500);
  };

  const handleSocialLogin = (provider: 'google' | 'apple') => {
    // Mock social login
    alert(`Mock ${provider} OAuth login would happen here`);
    setTimeout(() => {
      onComplete();
    }, 500);
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
        <AnimatePresence mode="wait">
          {/* Method Selection Step */}
          {currentStep === 'method' && (
            <motion.div
              key="method"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={springConfig}
              className="flex-1 flex flex-col justify-center"
            >
              <div className="text-center mb-12">
                <motion.div
                  className="w-24 h-24 rounded-[28px] bg-gradient-to-br from-purple-500 via-pink-500 to-cyan-500 flex items-center justify-center mx-auto mb-6 shadow-xl"
                  initial={{ scale: 0.8 }}
                  animate={{ scale: 1 }}
                  transition={{ ...springConfig, delay: 0.1 }}
                >
                  <span className="text-[40px]">👋</span>
                </motion.div>

                <motion.h1
                  className="text-large-title mb-4 text-white"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.2 }}
                >
                  Welcome to Bytspot
                </motion.h1>

                <motion.p
                  className="text-[17px] text-white/90"
                  style={{ fontWeight: 400 }}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.3 }}
                >
                  Sign in to get started
                </motion.p>
              </div>

              <motion.div
                className="space-y-3 mb-6"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.4 }}
              >
                {/* Phone Sign In */}
                <motion.button
                  onClick={() => setCurrentStep('phone')}
                  className="w-full rounded-[16px] p-4 border-2 border-white/30 bg-[#1C1C1E]/80 backdrop-blur-xl shadow-xl flex items-center gap-3"
                  whileTap={{ scale: 0.98 }}
                  transition={springConfig}
                >
                  <div className="w-12 h-12 rounded-full bg-cyan-500/30 flex items-center justify-center flex-shrink-0">
                    <Phone className="w-6 h-6 text-cyan-300" />
                  </div>
                  <div className="flex-1 text-left">
                    <p className="text-[17px] text-white" style={{ fontWeight: 600 }}>
                      Continue with Phone
                    </p>
                    <p className="text-[13px] text-white/70" style={{ fontWeight: 400 }}>
                      We'll send you a verification code
                    </p>
                  </div>
                  <ChevronRight className="w-5 h-5 text-white/50" />
                </motion.button>

                {/* Apple Sign In */}
                <motion.button
                  onClick={() => handleSocialLogin('apple')}
                  className="w-full rounded-[16px] p-4 border-2 border-white/30 bg-[#1C1C1E]/80 backdrop-blur-xl shadow-xl flex items-center gap-3"
                  whileTap={{ scale: 0.98 }}
                  transition={springConfig}
                >
                  <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
                    <span className="text-[24px]">🍎</span>
                  </div>
                  <div className="flex-1 text-left">
                    <p className="text-[17px] text-white" style={{ fontWeight: 600 }}>
                      Continue with Apple
                    </p>
                    <p className="text-[13px] text-white/70" style={{ fontWeight: 400 }}>
                      Sign in with your Apple ID
                    </p>
                  </div>
                  <ChevronRight className="w-5 h-5 text-white/50" />
                </motion.button>

                {/* Google Sign In */}
                <motion.button
                  onClick={() => handleSocialLogin('google')}
                  className="w-full rounded-[16px] p-4 border-2 border-white/30 bg-[#1C1C1E]/80 backdrop-blur-xl shadow-xl flex items-center gap-3"
                  whileTap={{ scale: 0.98 }}
                  transition={springConfig}
                >
                  <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
                    <span className="text-[24px]">G</span>
                  </div>
                  <div className="flex-1 text-left">
                    <p className="text-[17px] text-white" style={{ fontWeight: 600 }}>
                      Continue with Google
                    </p>
                    <p className="text-[13px] text-white/70" style={{ fontWeight: 400 }}>
                      Sign in with your Google account
                    </p>
                  </div>
                  <ChevronRight className="w-5 h-5 text-white/50" />
                </motion.button>
              </motion.div>

              <motion.p
                className="text-[12px] text-white/40 text-center"
                style={{ fontWeight: 400 }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5 }}
              >
                By signing in, you agree to our Terms of Service and Privacy Policy
              </motion.p>
            </motion.div>
          )}

          {/* Phone Number Entry Step */}
          {currentStep === 'phone' && (
            <motion.div
              key="phone"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={springConfig}
              className="flex-1 flex flex-col"
            >
              <motion.button
                onClick={() => setCurrentStep('method')}
                className="flex items-center gap-2 text-white/70 mb-8 -ml-2 p-2 rounded-lg tap-target"
                whileTap={{ scale: 0.95 }}
              >
                <ArrowLeft className="w-5 h-5" />
                <span className="text-[17px]" style={{ fontWeight: 500 }}>Back</span>
              </motion.button>

              <div className="flex-1 flex flex-col justify-center">
                <div className="mb-12">
                  <div className="w-16 h-16 rounded-full bg-cyan-500/30 flex items-center justify-center mx-auto mb-6">
                    <Phone className="w-8 h-8 text-cyan-300" />
                  </div>

                  <h2 className="text-title-1 mb-4 text-white text-center">
                    Enter your phone number
                  </h2>

                  <p className="text-[15px] text-white/70 text-center max-w-[300px] mx-auto" style={{ fontWeight: 400 }}>
                    We'll send you a verification code to confirm your number
                  </p>
                </div>

                <form onSubmit={handlePhoneSubmit} className="space-y-6">
                  <div>
                    <label className="block text-[13px] mb-2 px-1 text-white" style={{ fontWeight: 500 }}>
                      Phone Number
                    </label>
                    <div className="rounded-[16px] border-2 border-white/30 bg-[#1C1C1E]/80 backdrop-blur-xl shadow-xl">
                      <div className="flex items-center gap-3 p-4">
                        <span className="text-[17px] text-white" style={{ fontWeight: 500 }}>+1</span>
                        <input
                          type="tel"
                          value={phoneNumber}
                          onChange={(e) => setPhoneNumber(e.target.value.replace(/\D/g, '').slice(0, 10))}
                          placeholder="(555) 123-4567"
                          className="flex-1 bg-transparent text-[17px] outline-none text-white placeholder:text-white/60"
                          style={{ fontWeight: 400 }}
                          autoFocus
                        />
                      </div>
                    </div>
                  </div>

                  <motion.button
                    type="submit"
                    disabled={phoneNumber.length < 10}
                    className={`w-full rounded-[16px] p-4 flex items-center justify-center gap-2 transition-all ${
                      phoneNumber.length >= 10
                        ? 'bg-gradient-to-br from-cyan-500 to-blue-500 shadow-lg shadow-cyan-500/25'
                        : 'bg-white/10'
                    }`}
                    whileTap={{ scale: phoneNumber.length >= 10 ? 0.98 : 1 }}
                    transition={springConfig}
                  >
                    <span className={`text-[17px] ${
                      phoneNumber.length >= 10 ? 'text-white' : 'text-white/40'
                    }`} style={{ fontWeight: 600 }}>
                      Send Code
                    </span>
                    <ChevronRight className={`w-5 h-5 ${
                      phoneNumber.length >= 10 ? 'text-white' : 'text-white/40'
                    }`} strokeWidth={2.5} />
                  </motion.button>
                </form>
              </div>
            </motion.div>
          )}

          {/* Verification Code Step */}
          {currentStep === 'code' && (
            <motion.div
              key="code"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={springConfig}
              className="flex-1 flex flex-col"
            >
              <motion.button
                onClick={() => setCurrentStep('phone')}
                className="flex items-center gap-2 text-white/70 mb-8 -ml-2 p-2 rounded-lg tap-target"
                whileTap={{ scale: 0.95 }}
              >
                <ArrowLeft className="w-5 h-5" />
                <span className="text-[17px]" style={{ fontWeight: 500 }}>Back</span>
              </motion.button>

              <div className="flex-1 flex flex-col justify-center">
                <div className="mb-12">
                  <div className="w-16 h-16 rounded-full bg-cyan-500/30 flex items-center justify-center mx-auto mb-6">
                    <Mail className="w-8 h-8 text-cyan-300" />
                  </div>

                  <h2 className="text-title-1 mb-4 text-white text-center">
                    Enter verification code
                  </h2>

                  <p className="text-[15px] text-white/70 text-center max-w-[300px] mx-auto" style={{ fontWeight: 400 }}>
                    We sent a code to +1 {phoneNumber}
                  </p>
                </div>

                <div className="space-y-8">
                  {/* Code Input */}
                  <div className="flex justify-center gap-3">
                    {verificationCode.map((digit, index) => (
                      <input
                        key={index}
                        id={`code-${index}`}
                        type="text"
                        inputMode="numeric"
                        maxLength={1}
                        value={digit}
                        onChange={(e) => handleCodeChange(index, e.target.value)}
                        className="w-12 h-14 rounded-[12px] border-2 border-white/30 bg-[#1C1C1E]/80 backdrop-blur-xl text-center text-[24px] text-white outline-none focus:border-cyan-400 transition-colors shadow-xl"
                        style={{ fontWeight: 600 }}
                      />
                    ))}
                  </div>

                  {isVerifying && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="p-4 rounded-[12px] bg-cyan-500/20 border border-cyan-400/30 flex items-center justify-center gap-2"
                    >
                      <div className="w-5 h-5 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
                      <span className="text-[15px] text-cyan-400" style={{ fontWeight: 600 }}>
                        Verifying...
                      </span>
                    </motion.div>
                  )}

                  <motion.button
                    onClick={() => {
                      setVerificationCode(['', '', '', '', '', '']);
                      // Mock resend
                    }}
                    className="w-full text-[15px] text-cyan-400"
                    style={{ fontWeight: 600 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    Resend Code
                  </motion.button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
