import { motion } from 'motion/react';
import { Shield, AlertTriangle, Camera, FileText, CheckCircle } from 'lucide-react';
import { useState } from 'react';

interface ValetLiabilityWaiverProps {
  isDarkMode: boolean;
  vehicleInfo: {
    make: string;
    model: string;
    color: string;
    plate: string;
  };
  onAccept: () => void;
}

export function ValetLiabilityWaiver({
  isDarkMode,
  vehicleInfo,
  onAccept
}: ValetLiabilityWaiverProps) {
  const [acknowledged, setAcknowledged] = useState({
    platform: false,
    insurance: false,
    photos: false,
    preExisting: false,
    personalItems: false,
  });

  const springConfig = {
    type: "spring" as const,
    stiffness: 320,
    damping: 30,
    mass: 0.8,
  };

  const allAcknowledged = Object.values(acknowledged).every(v => v);

  return (
    <motion.div
      className="fixed inset-0 z-[80] bg-[#000000]/95 backdrop-blur-xl flex items-end"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        className="w-full max-w-[393px] mx-auto bg-gradient-to-br from-[#1C1C1E] to-[#000000] rounded-t-[24px] border-t-2 border-x-2 border-white/30 max-h-[90vh] overflow-y-auto"
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={springConfig}
      >
        <div className="sticky top-0 bg-gradient-to-br from-red-500/20 to-orange-500/20 border-b-2 border-white/30 backdrop-blur-xl p-4 z-10">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-12 h-12 rounded-full bg-red-500/30 border-2 border-red-400/50 flex items-center justify-center">
              <Shield className="w-6 h-6 text-red-400" strokeWidth={2.5} />
            </div>
            <div>
              <h2 className="text-[17px] text-white" style={{ fontWeight: 700 }}>
                Liability Waiver Required
              </h2>
              <p className="text-[13px] text-white/70" style={{ fontWeight: 500 }}>
                {vehicleInfo.color} {vehicleInfo.make} {vehicleInfo.model}
              </p>
            </div>
          </div>

          <div className="p-3 rounded-[12px] bg-red-500/20 border border-red-400/40">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" strokeWidth={2.5} />
              <p className="text-[12px] text-red-200" style={{ fontWeight: 500 }}>
                Please read carefully before proceeding with valet service
              </p>
            </div>
          </div>
        </div>

        <div className="p-4 space-y-4">
          {/* Platform Status */}
          <div className="p-4 rounded-[16px] bg-[#1C1C1E]/80 border-2 border-white/30">
            <h3 className="text-[15px] text-white mb-3" style={{ fontWeight: 600 }}>
              Platform Disclaimer
            </h3>
            
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={acknowledged.platform}
                onChange={(e) => setAcknowledged({ ...acknowledged, platform: e.target.checked })}
                className="w-5 h-5 mt-0.5 flex-shrink-0 rounded"
              />
              <div>
                <p className="text-[14px] text-white mb-2" style={{ fontWeight: 500 }}>
                  I understand Bytspot is a Technology Platform Only
                </p>
                <div className="text-[13px] text-white/70 space-y-1" style={{ fontWeight: 400 }}>
                  <p>• Bytspot connects users with independent valet service providers</p>
                  <p>• Valet service providers are NOT employees of Bytspot</p>
                  <p>• Bytspot does not provide valet services directly</p>
                  <p>• Bytspot is NOT responsible for service provider actions</p>
                </div>
              </div>
            </label>
          </div>

          {/* Insurance Notice */}
          <div className="p-4 rounded-[16px] bg-[#1C1C1E]/80 border-2 border-white/30">
            <h3 className="text-[15px] text-white mb-3" style={{ fontWeight: 600 }}>
              Insurance & Liability
            </h3>
            
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={acknowledged.insurance}
                onChange={(e) => setAcknowledged({ ...acknowledged, insurance: e.target.checked })}
                className="w-5 h-5 mt-0.5 flex-shrink-0 rounded"
              />
              <div>
                <p className="text-[14px] text-white mb-2" style={{ fontWeight: 500 }}>
                  I acknowledge Bytspot is NOT liable for:
                </p>
                <div className="text-[13px] text-white/70 space-y-1" style={{ fontWeight: 400 }}>
                  <p>• Vehicle damage, scratches, dents, or mechanical issues</p>
                  <p>• Theft or vandalism of the vehicle or its contents</p>
                  <p>• Accidents or collisions during valet service</p>
                  <p>• Injuries to passengers or third parties</p>
                  <p>• Delay, loss, or failure of service providers</p>
                </div>
                <div className="mt-2 p-2 rounded bg-cyan-500/10 border border-cyan-400/30">
                  <p className="text-[12px] text-cyan-300" style={{ fontWeight: 500 }}>
                    ℹ️ Service providers carry commercial insurance. Contact them directly for claims.
                  </p>
                </div>
              </div>
            </label>
          </div>

          {/* Photo Documentation */}
          <div className="p-4 rounded-[16px] bg-gradient-to-br from-purple-500/10 to-pink-500/10 border-2 border-purple-400/40">
            <h3 className="text-[15px] text-white mb-3" style={{ fontWeight: 600 }}>
              Photo Verification (REQUIRED)
            </h3>
            
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={acknowledged.photos}
                onChange={(e) => setAcknowledged({ ...acknowledged, photos: e.target.checked })}
                className="w-5 h-5 mt-0.5 flex-shrink-0 rounded"
              />
              <div>
                <p className="text-[14px] text-white mb-2" style={{ fontWeight: 500 }}>
                  I will ensure time-stamped, geo-located photos are taken
                </p>
                <div className="text-[13px] text-white/70 space-y-1 mb-2" style={{ fontWeight: 400 }}>
                  <p>• Service provider MUST photograph all vehicle sides before pickup</p>
                  <p>• Service provider MUST photograph all vehicle sides after delivery</p>
                  <p>• Photos include dashboard (mileage/fuel), body panels, and license plates</p>
                  <p>• These photos are your ONLY proof of vehicle condition</p>
                </div>
                <div className="flex items-center gap-2 p-2 rounded bg-yellow-500/20 border border-yellow-400/40">
                  <Camera className="w-4 h-4 text-yellow-400" strokeWidth={2.5} />
                  <p className="text-[11px] text-yellow-300" style={{ fontWeight: 600 }}>
                    Without photo evidence, damage claims cannot be verified
                  </p>
                </div>
              </div>
            </label>
          </div>

          {/* Pre-Existing Damage */}
          <div className="p-4 rounded-[16px] bg-[#1C1C1E]/80 border-2 border-white/30">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={acknowledged.preExisting}
                onChange={(e) => setAcknowledged({ ...acknowledged, preExisting: e.target.checked })}
                className="w-5 h-5 mt-0.5 flex-shrink-0 rounded"
              />
              <div>
                <p className="text-[14px] text-white mb-2" style={{ fontWeight: 500 }}>
                  I declare any pre-existing damage now
                </p>
                <p className="text-[13px] text-white/70" style={{ fontWeight: 400 }}>
                  Any damage not documented in pre-service photos will be assumed to have occurred during service. Notify the service provider of all scratches, dents, or issues BEFORE they take possession.
                </p>
              </div>
            </label>
          </div>

          {/* Personal Items */}
          <div className="p-4 rounded-[16px] bg-[#1C1C1E]/80 border-2 border-white/30">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={acknowledged.personalItems}
                onChange={(e) => setAcknowledged({ ...acknowledged, personalItems: e.target.checked })}
                className="w-5 h-5 mt-0.5 flex-shrink-0 rounded"
              />
              <div>
                <p className="text-[14px] text-white mb-2" style={{ fontWeight: 500 }}>
                  I acknowledge items left in vehicle are at my own risk
                </p>
                <p className="text-[13px] text-white/70" style={{ fontWeight: 400 }}>
                  Neither Bytspot nor service providers are responsible for lost, stolen, or damaged personal items, valuables, electronics, or belongings left in the vehicle.
                </p>
              </div>
            </label>
          </div>

          {/* Legal Notice */}
          <div className="p-3 rounded-[12px] bg-yellow-500/10 border border-yellow-400/30">
            <p className="text-[11px] text-yellow-300" style={{ fontWeight: 500 }}>
              ⚖️ This waiver is legally binding. By accepting, you release Bytspot from all liability. Consult an attorney if you have questions.
            </p>
          </div>

          {/* Accept Button */}
          <motion.button
            onClick={onAccept}
            disabled={!allAcknowledged}
            className="w-full py-4 rounded-[16px] bg-gradient-to-br from-green-500 to-emerald-500 border-2 border-white/30 text-[17px] text-white shadow-xl tap-target disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ fontWeight: 600 }}
            whileTap={{ scale: allAcknowledged ? 0.98 : 1 }}
            transition={springConfig}
          >
            {allAcknowledged ? (
              <span className="flex items-center justify-center gap-2">
                <CheckCircle className="w-5 h-5" strokeWidth={2.5} />
                Accept Waiver & Continue
              </span>
            ) : (
              'Please acknowledge all items to continue'
            )}
          </motion.button>

          <p className="text-center text-[11px] text-white/50 pb-4" style={{ fontWeight: 400 }}>
            NOT intended for collecting PII or securing sensitive data
          </p>
        </div>
      </motion.div>
    </motion.div>
  );
}
