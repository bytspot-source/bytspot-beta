import { useEffect } from 'react';
import { motion } from 'motion/react';
import { AlertTriangle, CheckCircle, Clock, FileText, ShieldCheck, Users } from 'lucide-react';
import type { OnboardingData } from '../ProviderOnboarding';

interface Step10CompleteProps {
  onComplete: () => void;
  data: OnboardingData;
}

export function Step10Complete({ onComplete, data }: Step10CompleteProps) {
  const springConfig = {
    type: "spring" as const,
    stiffness: 320,
    damping: 30,
    mass: 0.8,
  };

  // Auto-redirect after 5 seconds
  useEffect(() => {
    const timer = setTimeout(() => {
      onComplete();
    }, 5000);

    return () => clearTimeout(timer);
  }, [onComplete]);

  const nextSteps = [
    {
      icon: Clock,
      title: 'Review Process',
      description: 'Our team will review your application within 24-48 hours',
      color: 'from-blue-500 to-cyan-500',
    },
    {
      icon: FileText,
      title: 'Verification',
      description: 'We will verify your documents and information',
      color: 'from-purple-500 to-fuchsia-500',
    },
    {
      icon: CheckCircle,
      title: 'Approval',
      description: 'You will receive an email once approved',
      color: 'from-green-500 to-emerald-500',
    },
    {
      icon: Users,
      title: 'Go Live',
      description: 'Start accepting bookings and earning money',
      color: 'from-orange-500 to-red-500',
    },
  ];
  const vendorName = data.businessInfo?.legalName || data.businessInfo?.contactName || 'Provider';

  const reviewComplianceNow = () => {
    try {
      localStorage.setItem('bytspot_provider_dashboard_view', 'compliance');
    } catch {
      // The dashboard still opens normally if local storage is unavailable.
    }
    onComplete();
  };

  return (
    <div className="max-w-[800px] mx-auto px-4 pb-8">
      {/* Success Animation */}
      <motion.div
        className="text-center mb-8"
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ ...springConfig, delay: 0.1 }}
      >
        <motion.div
          className="w-24 h-24 mx-auto mb-6 rounded-full bg-gradient-to-br from-green-500/30 to-emerald-500/30 border-2 border-green-500/50 flex items-center justify-center backdrop-blur-xl shadow-2xl"
          initial={{ scale: 0, rotate: -180 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ ...springConfig, delay: 0.2 }}
        >
          <CheckCircle className="w-12 h-12 text-green-400" strokeWidth={2.5} />
        </motion.div>

        <motion.h1
          className="text-large-title text-white mb-3"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...springConfig, delay: 0.3 }}
        >
          Application Submitted!
        </motion.h1>
        
        <motion.p
          className="text-[17px] text-white/70"
          style={{ fontWeight: 400 }}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...springConfig, delay: 0.35 }}
        >
          Welcome to the Bytspot Provider community
        </motion.p>
      </motion.div>

      {/* Success Card */}
      <motion.div
        className="rounded-[24px] p-6 border-2 border-green-500/50 bg-gradient-to-br from-green-500/20 to-emerald-500/20 backdrop-blur-xl shadow-xl mb-8"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ ...springConfig, delay: 0.4 }}
      >
        <div className="text-center">
          <div className="text-[15px] text-green-300 mb-2" style={{ fontWeight: 600 }}>
            Application ID
          </div>
          <div className="text-[24px] text-white mb-2" style={{ fontWeight: 700, letterSpacing: '0.05em' }}>
            #{Date.now().toString().slice(-8)}
          </div>
          <div className="text-[13px] text-white/70" style={{ fontWeight: 400 }}>
            Reference this ID for any inquiries
          </div>
        </div>
      </motion.div>

      {/* What is Next */}
      <motion.div
        className="mb-8"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...springConfig, delay: 0.45 }}
      >
        <h2 className="text-title-2 text-white mb-4">
          What Happens Next?
        </h2>
        
        <div className="space-y-4">
          {nextSteps.map((step, index) => {
            const Icon = step.icon;
            return (
              <motion.div
                key={step.title}
                className="flex items-start gap-4 rounded-[20px] p-5 border-2 border-white/30 bg-[#1C1C1E]/80 backdrop-blur-xl"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ ...springConfig, delay: 0.5 + index * 0.05 }}
              >
                <div className={`w-12 h-12 rounded-[14px] bg-gradient-to-br ${step.color} opacity-90 flex items-center justify-center flex-shrink-0 shadow-lg`}>
                  <Icon className="w-6 h-6 text-white" strokeWidth={2.5} />
                </div>
                <div className="flex-1">
                  <h3 className="text-[17px] text-white mb-1" style={{ fontWeight: 600 }}>
                    {step.title}
                  </h3>
                  <p className="text-[15px] text-white/70" style={{ fontWeight: 400 }}>
                    {step.description}
                  </p>
                </div>
                <div className="text-[13px] text-white/50" style={{ fontWeight: 600 }}>
                  {index + 1}
                </div>
              </motion.div>
            );
          })}
        </div>
      </motion.div>

      <motion.div
        className="mb-8 rounded-[24px] border-2 border-cyan-300/30 bg-cyan-400/10 p-6 text-white shadow-xl backdrop-blur-xl"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...springConfig, delay: 0.62 }}
        data-testid="provider-onboarding-compliance-welcome"
      >
        <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-cyan-300/25 bg-cyan-300/10 px-3 py-1 text-[11px] uppercase tracking-[0.16em] text-cyan-100" style={{ fontWeight: 850 }}>
          <ShieldCheck className="h-3.5 w-3.5" strokeWidth={2.5} /> Compliance Hub
        </div>
        <h2 className="text-[23px] leading-tight" style={{ fontWeight: 850 }}>Welcome to Bytspot, {vendorName}!</h2>
        <p className="mt-3 text-[14px] leading-6 text-white/72">
          We’ve created a Compliance Hub in your dashboard to help you understand key requirements for cottage businesses in Georgia. Many successful providers use it to stay informed and build trust with customers.
        </p>
        <p className="mt-3 text-[15px] text-white" style={{ fontWeight: 750 }}>Would you like to review your checklist now?</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <button type="button" onClick={reviewComplianceNow} className="rounded-2xl bg-gradient-to-r from-cyan-400 to-violet-500 px-4 py-3 text-[14px] text-white shadow-xl" style={{ fontWeight: 850 }}>
            Review Checklist Now
          </button>
          <button type="button" onClick={onComplete} className="rounded-2xl border border-white/20 bg-white/[0.06] px-4 py-3 text-[14px] text-white" style={{ fontWeight: 750 }}>
            Go to Dashboard
          </button>
        </div>
        <p className="mt-4 rounded-2xl border border-amber-300/35 bg-amber-400/12 p-3 text-[12px] leading-5 text-amber-50" style={{ fontWeight: 700 }}>
          <AlertTriangle className="mr-1 inline h-3.5 w-3.5" strokeWidth={2.5} /> This checklist is for informational purposes only and does not constitute legal advice. Requirements can change. Please consult official state resources or a professional advisor.
        </p>
      </motion.div>

      {/* Resources */}
      <motion.div
        className="mb-8"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...springConfig, delay: 0.7 }}
      >
        <h2 className="text-title-2 text-white mb-4">
          Resources
        </h2>
        
        <div className="space-y-3">
          <button className="w-full flex items-center justify-between p-4 rounded-[16px] border-2 border-white/30 bg-[#1C1C1E]/80 backdrop-blur-xl hover:bg-white/5">
            <div className="text-left">
              <div className="text-[15px] text-white mb-1" style={{ fontWeight: 600 }}>
                Provider Guide
              </div>
              <div className="text-[13px] text-white/70" style={{ fontWeight: 400 }}>
                Learn best practices and tips
              </div>
            </div>
            <div className="text-purple-400 text-[13px]" style={{ fontWeight: 600 }}>
              View →
            </div>
          </button>

          <button className="w-full flex items-center justify-between p-4 rounded-[16px] border-2 border-white/30 bg-[#1C1C1E]/80 backdrop-blur-xl hover:bg-white/5">
            <div className="text-left">
              <div className="text-[15px] text-white mb-1" style={{ fontWeight: 600 }}>
                Provider Community
              </div>
              <div className="text-[13px] text-white/70" style={{ fontWeight: 400 }}>
                Connect with other providers
              </div>
            </div>
            <div className="text-purple-400 text-[13px]" style={{ fontWeight: 600 }}>
              Join →
            </div>
          </button>
        </div>
      </motion.div>

      {/* CTA Button */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...springConfig, delay: 0.75 }}
      >
        <motion.button
          onClick={onComplete}
          className="w-full py-4 rounded-full bg-gradient-to-r from-purple-500 to-cyan-500 text-white shadow-2xl"
          whileTap={{ scale: 0.98 }}
          whileHover={{ scale: 1.02 }}
        >
          <span className="text-[17px]" style={{ fontWeight: 600 }}>
            Go to Dashboard
          </span>
        </motion.button>
        
        <p className="text-center text-[13px] text-white/60 mt-4" style={{ fontWeight: 400 }}>
          Redirecting automatically in 5 seconds...
        </p>
      </motion.div>
    </div>
  );
}
