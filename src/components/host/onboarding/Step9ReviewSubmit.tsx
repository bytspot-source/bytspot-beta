import { motion } from 'motion/react';
import { ChevronRight, Check } from 'lucide-react';
import type { OnboardingData } from '../HostOnboarding';

interface Step9ReviewSubmitProps {
  onComplete: () => void;
  data: OnboardingData;
  onEdit: (step: number) => void;
}

export function Step9ReviewSubmit({ onComplete, data, onEdit }: Step9ReviewSubmitProps) {
  const springConfig = {
    type: "spring" as const,
    stiffness: 320,
    damping: 30,
    mass: 0.8,
  };

  const sections = [
    {
      title: 'Account Information',
      step: 1,
      items: [
        { label: 'Email', value: data.account?.email },
        { label: 'Phone', value: data.account?.phone },
      ],
    },
    {
      title: 'Host Type',
      step: 2,
      items: [
        { label: 'Type', value: data.hostType ? data.hostType.charAt(0).toUpperCase() + data.hostType.slice(1) : 'N/A' },
      ],
    },
    {
      title: 'Business Details',
      step: 3,
      items: [
        { label: 'Name', value: data.businessInfo?.contactName },
        { label: 'Address', value: data.businessInfo?.address.street },
        { label: 'Spots', value: data.businessInfo?.numberOfSpots },
      ],
    },
    {
      title: 'Listing',
      step: 4,
      items: [
        { label: 'Location', value: data.listing?.location.address },
        { label: 'Type', value: data.listing?.spotType },
        { label: 'Size', value: data.listing?.size },
      ],
    },
    {
      title: 'Pricing',
      step: 5,
      items: [
        { label: 'Hourly', value: data.pricing ? `$${data.pricing.hourly}/hr` : 'N/A' },
        { label: 'Daily', value: data.pricing?.daily ? `$${data.pricing.daily}/day` : 'N/A' },
        { label: 'Dynamic Pricing', value: data.pricing?.dynamicPricing.enabled ? 'Enabled' : 'Disabled' },
      ],
    },
    {
      title: 'Availability',
      step: 6,
      items: [
        { label: 'Min Booking', value: data.availability ? `${data.availability.rules.minBooking} hour(s)` : 'N/A' },
        { label: 'Cancellation', value: data.availability?.rules.cancellationPolicy },
      ],
    },
    {
      title: 'Payout',
      step: 8,
      items: [
        { label: 'Account Holder', value: data.payout?.bankAccount.accountHolder },
        { label: 'Account Type', value: data.payout?.bankAccount.accountType },
        { label: 'Schedule', value: data.payout?.schedule },
      ],
    },
  ];

  return (
    <div className="max-w-[800px] mx-auto px-4 pb-8">
      <motion.div
        className="text-center mb-8"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={springConfig}
      >
        <h1 className="text-large-title text-white mb-3">
          Review & Submit
        </h1>
        <p className="text-[17px] text-white/70" style={{ fontWeight: 400 }}>
          Make sure everything looks good
        </p>
      </motion.div>

      {/* Review Sections */}
      <div className="space-y-4 mb-8">
        {sections.map((section, index) => (
          <motion.div
            key={section.title}
            className="rounded-[20px] p-5 border-2 border-white/30 bg-[#1C1C1E]/80 backdrop-blur-xl"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...springConfig, delay: index * 0.05 }}
          >
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-[17px] text-white mb-1" style={{ fontWeight: 600 }}>
                  {section.title}
                </h3>
              </div>
              <button
                onClick={() => onEdit(section.step)}
                className="flex items-center gap-1 text-purple-400 text-[14px]"
                style={{ fontWeight: 600 }}
              >
                Edit
                <ChevronRight className="w-4 h-4" strokeWidth={2.5} />
              </button>
            </div>
            
            <div className="space-y-2">
              {section.items.map((item) => (
                <div key={item.label} className="flex justify-between text-[15px]">
                  <span className="text-white/70" style={{ fontWeight: 400 }}>
                    {item.label}
                  </span>
                  <span className="text-white" style={{ fontWeight: 500 }}>
                    {item.value || 'Not set'}
                  </span>
                </div>
              ))}
            </div>
          </motion.div>
        ))}
      </div>

      {/* Terms Acceptance */}
      <motion.div
        className="rounded-[20px] p-6 border-2 border-white/30 bg-[#1C1C1E]/80 backdrop-blur-xl mb-6"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...springConfig, delay: 0.4 }}
      >
        <div className="flex items-start gap-3">
          <div className="w-6 h-6 rounded-full bg-gradient-to-br from-purple-500 to-cyan-500 flex items-center justify-center flex-shrink-0 mt-0.5">
            <Check className="w-4 h-4 text-white" strokeWidth={3} />
          </div>
          <div>
            <p className="text-[15px] text-white/90 leading-relaxed" style={{ fontWeight: 400 }}>
              By submitting, you agree to the{' '}
              <span className="text-purple-400" style={{ fontWeight: 600 }}>
                Bytspot Host Agreement
              </span>
              , including our{' '}
              <span className="text-purple-400" style={{ fontWeight: 600 }}>
                Terms of Service
              </span>{' '}
              and{' '}
              <span className="text-purple-400" style={{ fontWeight: 600 }}>
                Privacy Policy
              </span>
              . Your listing will be reviewed within 1-2 business days.
            </p>
          </div>
        </div>
      </motion.div>

      {/* Submit Button */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...springConfig, delay: 0.45 }}
      >
        <motion.button
          onClick={onComplete}
          className="w-full py-4 rounded-full bg-gradient-to-r from-purple-500 to-cyan-500 text-white shadow-2xl"
          whileTap={{ scale: 0.98 }}
          whileHover={{ scale: 1.02 }}
        >
          <span className="text-[17px]" style={{ fontWeight: 600 }}>
            Submit for Approval
          </span>
        </motion.button>
        
        <p className="text-center text-[13px] text-white/60 mt-4" style={{ fontWeight: 400 }}>
          Average approval time: 24 hours
        </p>
      </motion.div>
    </div>
  );
}
