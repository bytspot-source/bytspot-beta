import { useState } from 'react';
import { motion } from 'motion/react';
import { Upload, Shield, CheckCircle } from 'lucide-react';
import type { OnboardingData } from '../HostOnboarding';

interface Step7VerificationProps {
  onComplete: (data: Partial<OnboardingData>) => void;
  initialValue?: OnboardingData['verification'];
  hostType?: 'venue' | 'parking' | 'valet';
}

export function Step7Verification({ onComplete, initialValue, hostType }: Step7VerificationProps) {
  const [idUploaded, setIdUploaded] = useState(false);
  const [licenseUploaded, setLicenseUploaded] = useState(false);

  const springConfig = {
    type: "spring" as const,
    stiffness: 320,
    damping: 30,
    mass: 0.8,
  };

  const isCommercial = hostType === 'parking' || hostType === 'valet';

  const handleContinue = () => {
    onComplete({
      verification: {
        identity: {
          idType: 'drivers_license',
          idPhotos: { front: 'mock_id_front.jpg', back: 'mock_id_back.jpg' },
        },
        business: isCommercial ? {
          licensePhoto: 'mock_license.jpg',
          insurancePhoto: 'mock_insurance.jpg',
        } : undefined,
      },
    });
  };

  return (
    <div className="max-w-[800px] mx-auto px-4 pb-8">
      <motion.div
        className="text-center mb-8"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={springConfig}
      >
        <h1 className="text-large-title text-white mb-3">
          Verification
        </h1>
        <p className="text-[17px] text-white/70" style={{ fontWeight: 400 }}>
          Verify your identity and property
        </p>
      </motion.div>

      <div className="space-y-6">
        {/* Identity Verification */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...springConfig, delay: 0.1 }}
        >
          <label className="block text-[15px] text-white mb-3" style={{ fontWeight: 600 }}>
            Government ID
          </label>
          <button
            onClick={() => setIdUploaded(true)}
            className="w-full border-2 border-dashed border-white/30 rounded-[20px] p-8 text-center bg-[#1C1C1E]/80 backdrop-blur-xl hover:border-purple-500/50 transition-colors"
          >
            {idUploaded ? (
              <div className="flex flex-col items-center gap-3">
                <CheckCircle className="w-12 h-12 text-green-400" strokeWidth={2} />
                <p className="text-[15px] text-green-400" style={{ fontWeight: 600 }}>
                  ID Uploaded Successfully
                </p>
                <p className="text-[13px] text-white/60" style={{ fontWeight: 400 }}>
                  Drivers License • Front & Back
                </p>
              </div>
            ) : (
              <>
                <Upload className="w-12 h-12 text-white/60 mx-auto mb-3" strokeWidth={2} />
                <p className="text-[15px] text-white/80 mb-2" style={{ fontWeight: 600 }}>
                  Upload Government ID
                </p>
                <p className="text-[13px] text-white/60" style={{ fontWeight: 400 }}>
                  Drivers License, Passport, or State ID
                </p>
              </>
            )}
          </button>
        </motion.div>

        {/* Business Documents - Commercial only */}
        {isCommercial && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...springConfig, delay: 0.2 }}
          >
            <label className="block text-[15px] text-white mb-3" style={{ fontWeight: 600 }}>
              Business License
            </label>
            <button
              onClick={() => setLicenseUploaded(true)}
              className="w-full border-2 border-dashed border-white/30 rounded-[20px] p-8 text-center bg-[#1C1C1E]/80 backdrop-blur-xl hover:border-purple-500/50 transition-colors"
            >
              {licenseUploaded ? (
                <div className="flex flex-col items-center gap-3">
                  <CheckCircle className="w-12 h-12 text-green-400" strokeWidth={2} />
                  <p className="text-[15px] text-green-400" style={{ fontWeight: 600 }}>
                    License Uploaded Successfully
                  </p>
                </div>
              ) : (
                <>
                  <Upload className="w-12 h-12 text-white/60 mx-auto mb-3" strokeWidth={2} />
                  <p className="text-[15px] text-white/80 mb-2" style={{ fontWeight: 600 }}>
                    Upload Business License
                  </p>
                  <p className="text-[13px] text-white/60" style={{ fontWeight: 400 }}>
                    Required for commercial operations
                  </p>
                </>
              )}
            </button>
          </motion.div>
        )}

        {/* Info Card */}
        <motion.div
          className="rounded-[20px] p-6 border-2 border-blue-500/50 bg-blue-500/20 backdrop-blur-xl"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...springConfig, delay: 0.3 }}
        >
          <div className="flex items-start gap-4">
            <Shield className="w-6 h-6 text-blue-400 flex-shrink-0 mt-1" strokeWidth={2.5} />
            <div>
              <h3 className="text-[15px] text-white mb-2" style={{ fontWeight: 600 }}>
                Your information is secure
              </h3>
              <p className="text-[13px] text-white/80" style={{ fontWeight: 400 }}>
                We use bank-level encryption to protect your documents. Verification typically takes 1-2 business days.
              </p>
            </div>
          </div>
        </motion.div>
      </div>

      <motion.div
        className="mt-8"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...springConfig, delay: 0.4 }}
      >
        <motion.button
          onClick={handleContinue}
          className="w-full py-4 rounded-full bg-gradient-to-r from-purple-500 to-cyan-500 text-white shadow-xl"
          whileTap={{ scale: 0.98 }}
          whileHover={{ scale: 1.02 }}
        >
          <span className="text-[17px]" style={{ fontWeight: 600 }}>
            Continue
          </span>
        </motion.button>
        
        <p className="text-center text-[13px] text-white/50 mt-4" style={{ fontWeight: 400 }}>
          You can upload documents later from your dashboard
        </p>
      </motion.div>
    </div>
  );
}
