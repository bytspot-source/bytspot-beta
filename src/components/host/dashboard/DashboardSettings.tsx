import { motion } from 'motion/react';
import { 
  User, 
  Building2, 
  Bell, 
  Lock, 
  CreditCard, 
  HelpCircle, 
  FileText,
  LogOut,
  ChevronRight,
  Mail,
  Phone,
  MapPin,
  Shield
} from 'lucide-react';
import { useState } from 'react';

interface DashboardSettingsProps {
  isDarkMode: boolean;
}

export function DashboardSettings({ isDarkMode }: DashboardSettingsProps) {
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [instantBook, setInstantBook] = useState(true);

  const springConfig = {
    type: "spring" as const,
    stiffness: 320,
    damping: 30,
    mass: 0.8,
  };

  const accountSettings = [
    {
      icon: User,
      label: 'Personal Information',
      description: 'Update your profile details',
      color: 'text-purple-400',
    },
    {
      icon: Building2,
      label: 'Business Information',
      description: 'Edit company details and tax info',
      color: 'text-cyan-400',
    },
    {
      icon: Lock,
      label: 'Password & Security',
      description: 'Change password and 2FA settings',
      color: 'text-green-400',
    },
    {
      icon: CreditCard,
      label: 'Payout Methods',
      description: 'Manage bank accounts and payments',
      color: 'text-yellow-400',
    },
  ];

  const preferencesSettings = [
    {
      icon: Bell,
      label: 'Notification Preferences',
      description: 'Email, push, and SMS notifications',
      color: 'text-orange-400',
    },
    {
      icon: Shield,
      label: 'Privacy Settings',
      description: 'Control your data and visibility',
      color: 'text-blue-400',
    },
  ];

  const supportSettings = [
    {
      icon: HelpCircle,
      label: 'Help Center',
      description: 'FAQs and support articles',
      color: 'text-purple-400',
    },
    {
      icon: Mail,
      label: 'Contact Support',
      description: 'Get help from our team',
      color: 'text-cyan-400',
    },
    {
      icon: FileText,
      label: 'Legal & Policies',
      description: 'Terms, privacy, and agreements',
      color: 'text-green-400',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={springConfig}
      >
        <h1 className="text-[34px] text-white mb-2" style={{ fontWeight: 700 }}>
          Settings
        </h1>
        <p className="text-[17px] text-white/70" style={{ fontWeight: 400 }}>
          Manage your account and preferences
        </p>
      </motion.div>

      {/* Account Information Card */}
      <motion.div
        className="rounded-[20px] p-6 border-2 border-white/30 bg-[#1C1C1E]/80 backdrop-blur-xl shadow-xl"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...springConfig, delay: 0.1 }}
      >
        <div className="flex items-center gap-4 mb-4">
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-purple-500/40 to-cyan-500/40 border-2 border-white/30 flex items-center justify-center">
            <User className="w-8 h-8 text-white" strokeWidth={2.5} />
          </div>
          
          <div>
            <h2 className="text-[20px] text-white mb-1" style={{ fontWeight: 600 }}>
              Alex Johnson
            </h2>
            <p className="text-[15px] text-white/70" style={{ fontWeight: 400 }}>
              Host since October 2025
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-2 text-[15px] text-white/90">
            <Mail className="w-4 h-4 text-white/70" strokeWidth={2.5} />
            <span>alex.johnson@example.com</span>
          </div>
          
          <div className="flex items-center gap-2 text-[15px] text-white/90">
            <Phone className="w-4 h-4 text-white/70" strokeWidth={2.5} />
            <span>+1 (555) 123-4567</span>
          </div>
          
          <div className="flex items-center gap-2 text-[15px] text-white/90">
            <MapPin className="w-4 h-4 text-white/70" strokeWidth={2.5} />
            <span>San Francisco, CA</span>
          </div>
        </div>
      </motion.div>

      {/* Account Settings */}
      <div>
        <h2 className="text-[20px] text-white mb-4 px-2" style={{ fontWeight: 600 }}>
          Account
        </h2>
        
        <motion.div
          className="rounded-[20px] border-2 border-white/30 bg-[#1C1C1E]/80 backdrop-blur-xl shadow-xl overflow-hidden"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...springConfig, delay: 0.2 }}
        >
          {accountSettings.map((setting, index) => {
            const Icon = setting.icon;
            
            return (
              <motion.button
                key={setting.label}
                className={`w-full flex items-center gap-4 p-4 hover:bg-white/5 transition-colors ${
                  index !== accountSettings.length - 1 ? 'border-b-2 border-white/10' : ''
                }`}
                whileTap={{ scale: 0.98 }}
                transition={springConfig}
              >
                <div className={`w-10 h-10 rounded-full bg-[#2C2C2E]/60 border-2 border-white/20 flex items-center justify-center`}>
                  <Icon className={`w-5 h-5 ${setting.color}`} strokeWidth={2.5} />
                </div>

                <div className="flex-1 text-left">
                  <div className="text-[15px] text-white mb-0.5" style={{ fontWeight: 600 }}>
                    {setting.label}
                  </div>
                  <div className="text-[13px] text-white/70" style={{ fontWeight: 400 }}>
                    {setting.description}
                  </div>
                </div>

                <ChevronRight className="w-5 h-5 text-white/50" strokeWidth={2.5} />
              </motion.button>
            );
          })}
        </motion.div>
      </div>

      {/* Preferences */}
      <div>
        <h2 className="text-[20px] text-white mb-4 px-2" style={{ fontWeight: 600 }}>
          Preferences
        </h2>
        
        <motion.div
          className="rounded-[20px] border-2 border-white/30 bg-[#1C1C1E]/80 backdrop-blur-xl shadow-xl overflow-hidden"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...springConfig, delay: 0.3 }}
        >
          {preferencesSettings.map((setting, index) => {
            const Icon = setting.icon;
            
            return (
              <motion.button
                key={setting.label}
                className={`w-full flex items-center gap-4 p-4 hover:bg-white/5 transition-colors ${
                  index !== preferencesSettings.length - 1 ? 'border-b-2 border-white/10' : ''
                }`}
                whileTap={{ scale: 0.98 }}
                transition={springConfig}
              >
                <div className={`w-10 h-10 rounded-full bg-[#2C2C2E]/60 border-2 border-white/20 flex items-center justify-center`}>
                  <Icon className={`w-5 h-5 ${setting.color}`} strokeWidth={2.5} />
                </div>

                <div className="flex-1 text-left">
                  <div className="text-[15px] text-white mb-0.5" style={{ fontWeight: 600 }}>
                    {setting.label}
                  </div>
                  <div className="text-[13px] text-white/70" style={{ fontWeight: 400 }}>
                    {setting.description}
                  </div>
                </div>

                <ChevronRight className="w-5 h-5 text-white/50" strokeWidth={2.5} />
              </motion.button>
            );
          })}
        </motion.div>
      </div>

      {/* Quick Toggles */}
      <motion.div
        className="rounded-[20px] p-6 border-2 border-white/30 bg-gradient-to-br from-purple-500/10 to-cyan-500/10 backdrop-blur-xl shadow-xl"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...springConfig, delay: 0.4 }}
      >
        <h3 className="text-[17px] text-white mb-4" style={{ fontWeight: 600 }}>
          Quick Settings
        </h3>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[15px] text-white mb-1" style={{ fontWeight: 600 }}>
                Push Notifications
              </div>
              <div className="text-[13px] text-white/70" style={{ fontWeight: 400 }}>
                Get alerts for new bookings
              </div>
            </div>
            
            <button
              onClick={() => setNotificationsEnabled(!notificationsEnabled)}
              className={`w-12 h-7 rounded-full transition-colors ${
                notificationsEnabled ? 'bg-green-500' : 'bg-white/20'
              }`}
            >
              <motion.div
                className="w-5 h-5 rounded-full bg-white shadow-lg"
                animate={{ x: notificationsEnabled ? 24 : 4 }}
                transition={springConfig}
              />
            </button>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <div className="text-[15px] text-white mb-1" style={{ fontWeight: 600 }}>
                Instant Book
              </div>
              <div className="text-[13px] text-white/70" style={{ fontWeight: 400 }}>
                Allow guests to book without approval
              </div>
            </div>
            
            <button
              onClick={() => setInstantBook(!instantBook)}
              className={`w-12 h-7 rounded-full transition-colors ${
                instantBook ? 'bg-green-500' : 'bg-white/20'
              }`}
            >
              <motion.div
                className="w-5 h-5 rounded-full bg-white shadow-lg"
                animate={{ x: instantBook ? 24 : 4 }}
                transition={springConfig}
              />
            </button>
          </div>
        </div>
      </motion.div>

      {/* Support & Legal */}
      <div>
        <h2 className="text-[20px] text-white mb-4 px-2" style={{ fontWeight: 600 }}>
          Support & Legal
        </h2>
        
        <motion.div
          className="rounded-[20px] border-2 border-white/30 bg-[#1C1C1E]/80 backdrop-blur-xl shadow-xl overflow-hidden"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...springConfig, delay: 0.5 }}
        >
          {supportSettings.map((setting, index) => {
            const Icon = setting.icon;
            
            return (
              <motion.button
                key={setting.label}
                className={`w-full flex items-center gap-4 p-4 hover:bg-white/5 transition-colors ${
                  index !== supportSettings.length - 1 ? 'border-b-2 border-white/10' : ''
                }`}
                whileTap={{ scale: 0.98 }}
                transition={springConfig}
              >
                <div className={`w-10 h-10 rounded-full bg-[#2C2C2E]/60 border-2 border-white/20 flex items-center justify-center`}>
                  <Icon className={`w-5 h-5 ${setting.color}`} strokeWidth={2.5} />
                </div>

                <div className="flex-1 text-left">
                  <div className="text-[15px] text-white mb-0.5" style={{ fontWeight: 600 }}>
                    {setting.label}
                  </div>
                  <div className="text-[13px] text-white/70" style={{ fontWeight: 400 }}>
                    {setting.description}
                  </div>
                </div>

                <ChevronRight className="w-5 h-5 text-white/50" strokeWidth={2.5} />
              </motion.button>
            );
          })}
        </motion.div>
      </div>

      {/* Danger Zone */}
      <motion.div
        className="rounded-[20px] p-6 border-2 border-red-500/50 bg-red-500/10 backdrop-blur-xl shadow-xl"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...springConfig, delay: 0.6 }}
      >
        <h3 className="text-[17px] text-red-400 mb-4" style={{ fontWeight: 600 }}>
          Danger Zone
        </h3>

        <motion.button
          onClick={() => {
            if (confirm('Are you sure you want to clear your host profile? This will restart the onboarding process.')) {
              localStorage.removeItem('bytspot_host_profile');
              localStorage.removeItem('bytspot_host_onboarding');
              window.location.reload();
            }
          }}
          className="w-full flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-red-500/20 border-2 border-red-500/50 hover:bg-red-500/30"
          whileTap={{ scale: 0.95 }}
          transition={springConfig}
        >
          <LogOut className="w-5 h-5 text-red-400" strokeWidth={2.5} />
          <span className="text-[15px] text-red-400" style={{ fontWeight: 600 }}>
            Reset Host Account
          </span>
        </motion.button>

        <p className="text-center text-[13px] text-red-300/70 mt-3" style={{ fontWeight: 400 }}>
          This action will clear your host profile and restart onboarding
        </p>
      </motion.div>

      {/* App Version */}
      <div className="text-center py-4">
        <p className="text-[13px] text-white/50" style={{ fontWeight: 400 }}>
          Bytspot Host Dashboard v1.0.0
        </p>
      </div>
    </div>
  );
}
