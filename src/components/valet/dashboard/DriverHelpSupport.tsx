import { motion, AnimatePresence } from 'motion/react';
import { ArrowLeft, MessageCircle, Mail, BookOpen, Users, ChevronDown } from 'lucide-react';
import { useState } from 'react';

interface DriverHelpSupportProps {
  isDarkMode: boolean;
  onBack: () => void;
}

const faqs = [
  {
    q: 'How do I accept a job?',
    a: 'Open the Active tab and tap "Accept Job" on any pending request. You have 60 seconds before it expires and routes to another driver.',
  },
  {
    q: 'When do I get paid?',
    a: 'Payouts are processed every Wednesday and deposited to your primary bank account within 1–2 business days.',
  },
  {
    q: 'What is the 20% battery gate?',
    a: 'For safety, new jobs are paused when your e-bike battery drops below 20%. Charge up and update your battery level in Gear Registry.',
  },
  {
    q: 'How do I dispute a rating?',
    a: 'Go to History, select the job, and tap "Dispute Rating". Our team reviews all disputes within 48 hours.',
  },
  {
    q: 'Can I cancel an accepted job?',
    a: 'Yes, but cancellations within 5 minutes of pickup incur a $5 fee. Tap the job → "Cancel Job" and select a reason.',
  },
];

export function DriverHelpSupport({ isDarkMode, onBack }: DriverHelpSupportProps) {
  const springConfig = { type: 'spring' as const, stiffness: 320, damping: 30, mass: 0.8 };
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const contactOptions = [
    { icon: MessageCircle, label: 'Live Chat', description: 'Avg. response < 2 min', color: 'text-green-400', bg: 'bg-green-500/20 border-green-400/30' },
    { icon: Mail, label: 'Email Support', description: 'support@bytspot.com', color: 'text-purple-400', bg: 'bg-purple-500/20 border-purple-400/30' },
    { icon: BookOpen, label: 'Driver Handbook', description: 'Full policy & tips', color: 'text-cyan-400', bg: 'bg-cyan-500/20 border-cyan-400/30' },
    { icon: Users, label: 'Driver Community', description: 'Connect with other drivers', color: 'text-yellow-400', bg: 'bg-yellow-500/20 border-yellow-400/30' },
  ];

  return (
    <div className="h-full overflow-y-auto pb-24">
      {/* Header */}
      <motion.div className="px-4 pt-4 pb-4 flex items-center gap-3 sticky top-0 bg-[#000000] z-10"
        initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={springConfig}>
        <motion.button onClick={onBack}
          className="w-10 h-10 rounded-full flex items-center justify-center bg-[#1C1C1E]/80 backdrop-blur-xl border-2 border-white/30 shadow-xl"
          whileTap={{ scale: 0.9 }} transition={springConfig}>
          <ArrowLeft className="w-5 h-5 text-white" strokeWidth={2.5} />
        </motion.button>
        <div>
          <h1 className="text-title-2 text-white">Help &amp; Support</h1>
          <p className="text-[13px] text-white/60" style={{ fontWeight: 400 }}>Get help or contact support</p>
        </div>
      </motion.div>

      <div className="px-4 space-y-5">
        {/* Contact Options */}
        <motion.div className="rounded-[24px] p-5 border-2 border-white/30 bg-[#1C1C1E]/80 backdrop-blur-xl shadow-xl"
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ ...springConfig, delay: 0.05 }}>
          <h3 className="text-[17px] text-white mb-4" style={{ fontWeight: 600 }}>Contact Options</h3>
          <div className="grid grid-cols-2 gap-3">
            {contactOptions.map((opt, i) => {
              const Icon = opt.icon;
              return (
                <motion.button key={opt.label}
                  className={`rounded-[16px] p-4 border ${opt.bg} flex flex-col items-start gap-2 text-left hover:opacity-80 transition-opacity`}
                  initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                  transition={{ ...springConfig, delay: 0.05 + i * 0.04 }}
                  whileTap={{ scale: 0.97 }}>
                  <Icon className={`w-5 h-5 ${opt.color}`} strokeWidth={2.5} />
                  <div className="text-[14px] text-white" style={{ fontWeight: 600 }}>{opt.label}</div>
                  <div className="text-[11px] text-white/60" style={{ fontWeight: 400 }}>{opt.description}</div>
                </motion.button>
              );
            })}
          </div>
        </motion.div>

        {/* FAQ Accordion */}
        <motion.div className="rounded-[24px] p-5 border-2 border-white/30 bg-[#1C1C1E]/80 backdrop-blur-xl shadow-xl"
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ ...springConfig, delay: 0.15 }}>
          <h3 className="text-[17px] text-white mb-4" style={{ fontWeight: 600 }}>Frequently Asked Questions</h3>
          <div className="space-y-0">
            {faqs.map((faq, i) => (
              <div key={i} className={`${i !== faqs.length - 1 ? 'border-b border-white/10' : ''}`}>
                <button className="w-full flex items-center justify-between py-3.5 text-left"
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}>
                  <span className="text-[14px] text-white pr-3" style={{ fontWeight: 500 }}>{faq.q}</span>
                  <motion.div animate={{ rotate: openFaq === i ? 180 : 0 }} transition={{ duration: 0.2 }}>
                    <ChevronDown className="w-4 h-4 text-white/50 flex-shrink-0" strokeWidth={2.5} />
                  </motion.div>
                </button>
                <AnimatePresence>
                  {openFaq === i && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                      <p className="text-[13px] text-white/70 pb-3.5 leading-relaxed" style={{ fontWeight: 400 }}>{faq.a}</p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </div>
  );
}

