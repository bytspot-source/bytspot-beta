import { motion } from 'motion/react';
import { ArrowRight, Radio, Car, Clock } from 'lucide-react';
import { BrandLogo } from './BrandLogo';

interface LandingPageProps {
  isDarkMode: boolean;
  onGetStarted: () => void;
}

export function LandingPage({ isDarkMode, onGetStarted }: LandingPageProps) {
  return (
    <div className={`min-h-screen overflow-hidden transition-colors duration-500 ${
      isDarkMode ? 'bg-[#000000]' : 'bg-[#F5F7FA]'
    }`}>
      {/* Background gradients */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[15%] left-1/2 -translate-x-1/2 w-[500px] h-[500px]"
             style={{ background: 'radial-gradient(circle, rgba(168,85,247,0.22) 0%, transparent 70%)' }} />
        <div className="absolute bottom-[10%] left-1/2 -translate-x-1/2 w-[400px] h-[400px]"
             style={{ background: 'radial-gradient(circle, rgba(0,191,255,0.18) 0%, transparent 70%)' }} />
        <div className="absolute top-1/2 right-[5%] -translate-y-1/2 w-[300px] h-[300px]"
             style={{ background: 'radial-gradient(circle, rgba(255,0,255,0.12) 0%, transparent 70%)' }} />
      </div>

      {/* Content */}
      <div className="relative max-w-[393px] mx-auto min-h-screen flex flex-col px-6 py-12">
        <div className="flex-1 flex flex-col justify-center gap-10">

          {/* Logo + headline */}
          <div className="text-center space-y-5">
            <div className="flex justify-center">
              <BrandLogo size={100} animated={false} />
            </div>
            <div>
              <h1 className="text-[32px] font-bold text-white leading-tight tracking-tight">
                Know <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-cyan-400">Before</span> You Go.
              </h1>
              <p className={`mt-2 text-[15px] leading-relaxed ${isDarkMode ? 'text-white/60' : 'text-black/60'}`}>
                Live crowd levels, parking & ride ETAs<br />for Atlanta Midtown — all in one place.
              </p>
            </div>
          </div>

          {/* Feature pills */}
          <div className="flex flex-col gap-3">
            {[
              { icon: <Radio className="w-4 h-4 text-red-400" />, label: 'Live crowd levels at Midtown venues' },
              { icon: <Car className="w-4 h-4 text-cyan-400" />, label: 'Smart parking with live spot availability' },
              { icon: <Clock className="w-4 h-4 text-purple-400" />, label: 'Ride ETAs & valet options nearby' },
            ].map(({ icon, label }) => (
              <div key={label} className="flex items-center gap-3 px-4 py-3 rounded-[14px] bg-white/5 border border-white/10">
                <div className="w-8 h-8 rounded-full bg-white/8 flex items-center justify-center flex-shrink-0">{icon}</div>
                <span className={`text-[14px] ${isDarkMode ? 'text-white/80' : 'text-black/80'}`} style={{ fontWeight: 500 }}>{label}</span>
              </div>
            ))}
          </div>

          {/* CTA */}
          <motion.button
            className="w-full rounded-[16px] p-4 flex items-center justify-center gap-2 bg-gradient-to-br from-purple-500 to-cyan-500 shadow-lg shadow-purple-500/25"
            whileTap={{ scale: 0.98 }}
            onClick={onGetStarted}
          >
            <span className="text-[17px] text-white" style={{ fontWeight: 700 }}>Let's Go</span>
            <ArrowRight className="w-5 h-5 text-white" strokeWidth={2.5} />
          </motion.button>
        </div>

        {/* Footer */}
        <div className="text-center pt-8">
          <p className={`text-[12px] ${isDarkMode ? 'text-white/30' : 'text-black/30'}`}>
            By continuing, you agree to our Terms &amp; Privacy
          </p>
        </div>
      </div>
    </div>
  );
}
