import { motion } from 'motion/react';
import { Shield, CheckCircle, AlertTriangle, FileText, X } from 'lucide-react';
import { useState } from 'react';

interface IndependentContractorAgreementProps {
  isDarkMode: boolean;
  onAccept: () => void;
  onDecline: () => void;
  serviceType: 'valet' | 'host';
}

export function IndependentContractorAgreement({ 
  isDarkMode, 
  onAccept, 
  onDecline,
  serviceType 
}: IndependentContractorAgreementProps) {
  const [hasRead, setHasRead] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState({
    contractor: false,
    autonomy: false,
    ownTools: false,
    insurance: false,
    liability: false,
  });

  const springConfig = {
    type: "spring" as const,
    stiffness: 320,
    damping: 30,
    mass: 0.8,
  };

  const allTermsAccepted = Object.values(acceptedTerms).every(v => v);
  const serviceName = serviceType === 'valet' ? 'Valet Service Provider' : 'Parking Space Host';

  return (
    <motion.div
      className="fixed inset-0 z-[100] bg-[#000000] overflow-y-auto"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className="max-w-[393px] mx-auto min-h-screen p-4">
        {/* Header */}
        <div className="sticky top-0 bg-[#000000]/95 backdrop-blur-xl z-10 pb-4 mb-4 border-b-2 border-white/30">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-full bg-purple-500/20 border-2 border-purple-400/50 flex items-center justify-center">
                <FileText className="w-5 h-5 text-purple-400" strokeWidth={2.5} />
              </div>
              <div>
                <h1 className="text-[20px] text-white" style={{ fontWeight: 700 }}>
                  Service Provider Agreement
                </h1>
                <p className="text-[13px] text-white/70" style={{ fontWeight: 500 }}>
                  Independent Contractor Terms
                </p>
              </div>
            </div>
            <motion.button
              onClick={onDecline}
              className="w-9 h-9 rounded-full bg-red-500/20 border-2 border-red-400/50 flex items-center justify-center"
              whileTap={{ scale: 0.9 }}
            >
              <X className="w-5 h-5 text-red-400" strokeWidth={2.5} />
            </motion.button>
          </div>

          {/* Important Notice */}
          <div className="p-3 rounded-[12px] bg-yellow-500/10 border border-yellow-400/30">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-yellow-400 flex-shrink-0 mt-0.5" strokeWidth={2.5} />
              <p className="text-[12px] text-yellow-300" style={{ fontWeight: 500 }}>
                Please read carefully. This establishes you as an independent business, not an employee.
              </p>
            </div>
          </div>
        </div>

        {/* Agreement Content */}
        <div className="space-y-4 mb-6">
          {/* Legal Disclaimer */}
          <div className="p-4 rounded-[16px] bg-gradient-to-br from-red-500/10 to-orange-500/10 border-2 border-red-400/40">
            <h3 className="text-[15px] text-red-300 mb-2" style={{ fontWeight: 700 }}>
              ⚠️ LEGAL DISCLAIMER
            </h3>
            <p className="text-[13px] text-white/90 mb-2" style={{ fontWeight: 400 }}>
              This agreement has been prepared for informational purposes. You should consult with your own legal and tax advisors before accepting this agreement.
            </p>
            <p className="text-[12px] text-white/70 italic" style={{ fontWeight: 400 }}>
              Bytspot is a technology platform only. We do not employ service providers.
            </p>
          </div>

          {/* Key Terms */}
          <div className="p-4 rounded-[16px] bg-[#1C1C1E]/80 border-2 border-white/30">
            <h3 className="text-[17px] text-white mb-3" style={{ fontWeight: 600 }}>
              Independent Contractor Status
            </h3>
            
            <label className="flex items-start gap-3 mb-4 cursor-pointer">
              <input
                type="checkbox"
                checked={acceptedTerms.contractor}
                onChange={(e) => setAcceptedTerms({ ...acceptedTerms, contractor: e.target.checked })}
                className="w-5 h-5 mt-0.5 flex-shrink-0 rounded"
              />
              <div>
                <p className="text-[14px] text-white mb-1" style={{ fontWeight: 600 }}>
                  I am an Independent Business
                </p>
                <p className="text-[13px] text-white/70" style={{ fontWeight: 400 }}>
                  I understand that I am operating as an independent {serviceName}, NOT as an employee of Bytspot. 
                  I am responsible for my own taxes, insurance, and business expenses.
                </p>
              </div>
            </label>

            <label className="flex items-start gap-3 mb-4 cursor-pointer">
              <input
                type="checkbox"
                checked={acceptedTerms.autonomy}
                onChange={(e) => setAcceptedTerms({ ...acceptedTerms, autonomy: e.target.checked })}
                className="w-5 h-5 mt-0.5 flex-shrink-0 rounded"
              />
              <div>
                <p className="text-[14px] text-white mb-1" style={{ fontWeight: 600 }}>
                  Complete Work Autonomy
                </p>
                <p className="text-[13px] text-white/70" style={{ fontWeight: 400 }}>
                  I have full control over when, where, and how I work. I can:
                  • Reject any service request
                  • Set my own schedule
                  • Work for competitors
                  • Determine my own methods of service delivery
                </p>
              </div>
            </label>

            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={acceptedTerms.ownTools}
                onChange={(e) => setAcceptedTerms({ ...acceptedTerms, ownTools: e.target.checked })}
                className="w-5 h-5 mt-0.5 flex-shrink-0 rounded"
              />
              <div>
                <p className="text-[14px] text-white mb-1" style={{ fontWeight: 600 }}>
                  I Provide My Own Tools & Equipment
                </p>
                <p className="text-[13px] text-white/70" style={{ fontWeight: 400 }}>
                  {serviceType === 'valet' 
                    ? 'I provide my own smartphone, vehicle (if needed for transportation between locations), and any other equipment necessary to perform services. Bytspot only provides the platform app.'
                    : 'I own or control the parking space(s) I am listing. Bytspot only provides the platform technology.'}
                </p>
              </div>
            </label>
          </div>

          {/* Insurance & Liability */}
          <div className="p-4 rounded-[16px] bg-[#1C1C1E]/80 border-2 border-white/30">
            <h3 className="text-[17px] text-white mb-3" style={{ fontWeight: 600 }}>
              Insurance & Liability
            </h3>

            {serviceType === 'valet' && (
              <label className="flex items-start gap-3 mb-4 cursor-pointer">
                <input
                  type="checkbox"
                  checked={acceptedTerms.insurance}
                  onChange={(e) => setAcceptedTerms({ ...acceptedTerms, insurance: e.target.checked })}
                  className="w-5 h-5 mt-0.5 flex-shrink-0 rounded"
                />
                <div>
                  <p className="text-[14px] text-white mb-1" style={{ fontWeight: 600 }}>
                    Required Insurance Coverage
                  </p>
                  <p className="text-[13px] text-white/70 mb-2" style={{ fontWeight: 400 }}>
                    I understand that I must maintain:
                  </p>
                  <ul className="text-[12px] text-white/60 space-y-1 ml-4 list-disc" style={{ fontWeight: 400 }}>
                    <li>Valid commercial auto insurance or equivalent coverage</li>
                    <li>Garage keeper's legal liability insurance (if not provided by platform)</li>
                    <li>General liability insurance for my business operations</li>
                  </ul>
                </div>
              </label>
            )}

            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={acceptedTerms.liability}
                onChange={(e) => setAcceptedTerms({ ...acceptedTerms, liability: e.target.checked })}
                className="w-5 h-5 mt-0.5 flex-shrink-0 rounded"
              />
              <div>
                <p className="text-[14px] text-white mb-1" style={{ fontWeight: 600 }}>
                  Liability Acknowledgment
                </p>
                <p className="text-[13px] text-white/70" style={{ fontWeight: 400 }}>
                  I acknowledge that Bytspot is a technology platform only and does not assume liability for:
                  • Vehicle damage or theft
                  • Personal injury during service
                  • Property damage to third parties
                  • Pre-existing vehicle damage or conditions
                  • Items left in vehicles
                </p>
              </div>
            </label>
          </div>

          {/* Payment Terms */}
          <div className="p-4 rounded-[16px] bg-gradient-to-br from-green-500/10 to-emerald-500/10 border-2 border-green-400/40">
            <h3 className="text-[17px] text-white mb-2" style={{ fontWeight: 600 }}>
              Payment & Fund Holding
            </h3>
            <div className="space-y-2 text-[13px] text-white/90" style={{ fontWeight: 400 }}>
              <p>• Payments are processed through Stripe Connect (PCI-DSS compliant)</p>
              <p>• Funds are held for 24-48 hours after service completion to allow for fraud/damage claim review</p>
              <p>• You are responsible for all applicable taxes as an independent contractor</p>
              <p>• Bytspot will issue a 1099 form (if applicable) - we do NOT withhold taxes</p>
            </div>
          </div>

          {/* Background Check Notice */}
          {serviceType === 'valet' && (
            <div className="p-4 rounded-[16px] bg-gradient-to-br from-cyan-500/10 to-blue-500/10 border-2 border-cyan-400/40">
              <h3 className="text-[17px] text-white mb-2" style={{ fontWeight: 600 }}>
                Background Verification
              </h3>
              <p className="text-[13px] text-white/90" style={{ fontWeight: 400 }}>
                To ensure customer safety, all valet service providers must pass:
                • Motor vehicle record check
                • Criminal background check
                • Driving history verification (minimum 3 years clean record)
              </p>
            </div>
          )}

          {/* Scroll Acknowledgment */}
          <label className="flex items-center gap-3 p-4 rounded-[16px] bg-purple-500/10 border-2 border-purple-400/40 cursor-pointer">
            <input
              type="checkbox"
              checked={hasRead}
              onChange={(e) => setHasRead(e.target.checked)}
              className="w-5 h-5 flex-shrink-0 rounded"
            />
            <span className="text-[14px] text-purple-200" style={{ fontWeight: 600 }}>
              I have read and understood all terms above
            </span>
          </label>
        </div>

        {/* Action Buttons */}
        <div className="sticky bottom-0 bg-[#000000]/95 backdrop-blur-xl pt-4 pb-6 space-y-3">
          <motion.button
            onClick={onAccept}
            disabled={!allTermsAccepted || !hasRead}
            className="w-full py-4 rounded-[16px] bg-gradient-to-br from-green-500 to-emerald-500 border-2 border-white/30 text-[17px] text-white shadow-xl tap-target disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ fontWeight: 600 }}
            whileTap={{ scale: allTermsAccepted && hasRead ? 0.98 : 1 }}
            transition={springConfig}
          >
            {allTermsAccepted && hasRead ? (
              <span className="flex items-center justify-center gap-2">
                <CheckCircle className="w-5 h-5" strokeWidth={2.5} />
                Accept & Continue as Independent Contractor
              </span>
            ) : (
              'Please accept all terms to continue'
            )}
          </motion.button>

          <motion.button
            onClick={onDecline}
            className="w-full py-3 rounded-[16px] bg-[#1C1C1E]/80 border-2 border-white/30 text-[15px] text-white/70"
            style={{ fontWeight: 600 }}
            whileTap={{ scale: 0.98 }}
            transition={springConfig}
          >
            Decline & Exit
          </motion.button>

          <p className="text-center text-[11px] text-white/50 px-4" style={{ fontWeight: 400 }}>
            By accepting, you acknowledge this is a legal agreement. Consult an attorney if you have questions.
          </p>
        </div>
      </div>
    </motion.div>
  );
}
