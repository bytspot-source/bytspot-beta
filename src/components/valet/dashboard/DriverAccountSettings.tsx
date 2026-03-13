import { motion } from 'motion/react';
import { ArrowLeft, User, CreditCard, Lock, Bell, ChevronRight, Check } from 'lucide-react';
import { useState } from 'react';
import { mockDriverProfile, mockEarningsData } from '../../../utils/valetMockData';

interface DriverAccountSettingsProps {
  isDarkMode: boolean;
  onBack: () => void;
}

export function DriverAccountSettings({ isDarkMode, onBack }: DriverAccountSettingsProps) {
  const springConfig = { type: 'spring' as const, stiffness: 320, damping: 30, mass: 0.8 };
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(true);
  const [jobAlerts, setJobAlerts] = useState(true);
  const [payoutAlerts, setPayoutAlerts] = useState(true);
  const [promotionalAlerts, setPromotionalAlerts] = useState(false);

  const { name, email, phone, licenseInfo } = mockDriverProfile;
  const { recentPayouts } = mockEarningsData;

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
          <h1 className="text-title-2 text-white">Account Settings</h1>
          <p className="text-[13px] text-white/60" style={{ fontWeight: 400 }}>Manage your account preferences</p>
        </div>
      </motion.div>

      <div className="px-4 space-y-5">
        {/* Personal Info */}
        <motion.div className="rounded-[24px] p-5 border-2 border-white/30 bg-[#1C1C1E]/80 backdrop-blur-xl shadow-xl"
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ ...springConfig, delay: 0.05 }}>
          <div className="flex items-center gap-2 mb-4">
            <User className="w-5 h-5 text-purple-400" strokeWidth={2.5} />
            <h3 className="text-[17px] text-white" style={{ fontWeight: 600 }}>Personal Information</h3>
          </div>
          <div className="space-y-3">
            {[
              { label: 'Full Name', value: name },
              { label: 'Email', value: email },
              { label: 'Phone', value: phone },
              { label: "Driver's License", value: `${licenseInfo.number} · ${licenseInfo.state} · Exp ${licenseInfo.expiryDate}` },
            ].map((row) => (
              <div key={row.label} className="flex items-center justify-between py-2 border-b border-white/10 last:border-0">
                <span className="text-[13px] text-white/60" style={{ fontWeight: 500 }}>{row.label}</span>
                <div className="flex items-center gap-2">
                  <span className="text-[14px] text-white text-right max-w-[180px] truncate" style={{ fontWeight: 500 }}>{row.value}</span>
                  <ChevronRight className="w-4 h-4 text-white/30" strokeWidth={2.5} />
                </div>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Payout Methods */}
        <motion.div className="rounded-[24px] p-5 border-2 border-white/30 bg-[#1C1C1E]/80 backdrop-blur-xl shadow-xl"
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ ...springConfig, delay: 0.1 }}>
          <div className="flex items-center gap-2 mb-4">
            <CreditCard className="w-5 h-5 text-cyan-400" strokeWidth={2.5} />
            <h3 className="text-[17px] text-white" style={{ fontWeight: 600 }}>Payout Methods</h3>
          </div>
          <div className="rounded-[16px] p-4 bg-[#2C2C2E]/60 border border-white/20 flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-full bg-cyan-500/20 border border-cyan-400/30 flex items-center justify-center">
              <CreditCard className="w-5 h-5 text-cyan-400" strokeWidth={2.5} />
            </div>
            <div className="flex-1">
              <div className="text-[15px] text-white" style={{ fontWeight: 600 }}>{recentPayouts[0].method}</div>
              <div className="text-[12px] text-green-400" style={{ fontWeight: 500 }}>Primary · Active</div>
            </div>
            <Check className="w-5 h-5 text-green-400" strokeWidth={2.5} />
          </div>
          <button className="w-full py-2.5 rounded-[12px] bg-white/5 border border-white/20 text-[14px] text-white/70 hover:bg-white/10 transition-colors" style={{ fontWeight: 500 }}>
            + Add Payout Method
          </button>
        </motion.div>

        {/* Security */}
        <motion.div className="rounded-[24px] p-5 border-2 border-white/30 bg-[#1C1C1E]/80 backdrop-blur-xl shadow-xl"
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ ...springConfig, delay: 0.15 }}>
          <div className="flex items-center gap-2 mb-4">
            <Lock className="w-5 h-5 text-green-400" strokeWidth={2.5} />
            <h3 className="text-[17px] text-white" style={{ fontWeight: 600 }}>Security</h3>
          </div>
          <div className="flex items-center justify-between py-3 border-b border-white/10">
            <div>
              <div className="text-[15px] text-white" style={{ fontWeight: 600 }}>Two-Factor Auth</div>
              <div className="text-[12px] text-white/50" style={{ fontWeight: 400 }}>Protect your account with 2FA</div>
            </div>
            <button onClick={() => setTwoFactorEnabled(!twoFactorEnabled)}
              className={`w-12 h-6 rounded-full transition-colors relative ${twoFactorEnabled ? 'bg-green-500' : 'bg-white/20'}`}>
              <motion.div className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow"
                animate={{ left: twoFactorEnabled ? '26px' : '2px' }} transition={{ type: 'spring', stiffness: 500, damping: 30 }} />
            </button>
          </div>
          <button className="w-full flex items-center justify-between py-3">
            <div className="text-[15px] text-white" style={{ fontWeight: 600 }}>Change Password</div>
            <ChevronRight className="w-4 h-4 text-white/30" strokeWidth={2.5} />
          </button>
        </motion.div>

        {/* Notifications */}
        <motion.div className="rounded-[24px] p-5 border-2 border-white/30 bg-[#1C1C1E]/80 backdrop-blur-xl shadow-xl"
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ ...springConfig, delay: 0.2 }}>
          <div className="flex items-center gap-2 mb-4">
            <Bell className="w-5 h-5 text-yellow-400" strokeWidth={2.5} />
            <h3 className="text-[17px] text-white" style={{ fontWeight: 600 }}>Notifications</h3>
          </div>
          {[
            { label: 'New Job Alerts', sub: 'Get notified for new job requests', value: jobAlerts, set: setJobAlerts },
            { label: 'Payout Confirmations', sub: 'When your payout is processed', value: payoutAlerts, set: setPayoutAlerts },
            { label: 'Promotions & Tips', sub: 'Offers and driver tips', value: promotionalAlerts, set: setPromotionalAlerts },
          ].map((row, i, arr) => (
            <div key={row.label} className={`flex items-center justify-between py-3 ${i < arr.length - 1 ? 'border-b border-white/10' : ''}`}>
              <div>
                <div className="text-[15px] text-white" style={{ fontWeight: 600 }}>{row.label}</div>
                <div className="text-[12px] text-white/50" style={{ fontWeight: 400 }}>{row.sub}</div>
              </div>
              <button onClick={() => row.set(!row.value)}
                className={`w-12 h-6 rounded-full transition-colors relative flex-shrink-0 ${row.value ? 'bg-purple-500' : 'bg-white/20'}`}>
                <motion.div className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow"
                  animate={{ left: row.value ? '26px' : '2px' }} transition={{ type: 'spring', stiffness: 500, damping: 30 }} />
              </button>
            </div>
          ))}
        </motion.div>
      </div>
    </div>
  );
}

