import { motion } from 'motion/react';
import { 
  User, 
  Star, 
  Briefcase, 
  Calendar,
  Car,
  IdCard,
  Shield,
  ChevronRight,
  Settings,
  HelpCircle,
  LogOut,
  Award,
  MapPin
} from 'lucide-react';
import { useState } from 'react';
import { mockDriverProfile } from '../../../utils/valetMockData';
import { LocationSettings } from '../../LocationSettings';

interface DriverProfileViewProps {
  isDarkMode: boolean;
}

type DriverScreen = 'main' | 'location-settings';

export function DriverProfileView({ isDarkMode }: DriverProfileViewProps) {
  const [currentScreen, setCurrentScreen] = useState<DriverScreen>('main');

  const springConfig = {
    type: "spring" as const,
    stiffness: 320,
    damping: 30,
    mass: 0.8,
  };

  // Show sub-screens
  if (currentScreen === 'location-settings') {
    return <LocationSettings isDarkMode={isDarkMode} onBack={() => setCurrentScreen('main')} userRole="driver" />;
  }

  const menuItems = [
    {
      icon: MapPin,
      label: 'Location & Privacy',
      description: 'Required for job tracking and dispatch',
      color: 'text-blue-400',
      screen: 'location-settings' as DriverScreen,
    },
    {
      icon: Settings,
      label: 'Account Settings',
      description: 'Manage your account preferences',
      color: 'text-purple-400',
      screen: null,
    },
    {
      icon: HelpCircle,
      label: 'Help & Support',
      description: 'Get help or contact support',
      color: 'text-cyan-400',
      screen: null,
    },
    {
      icon: Award,
      label: 'Achievements',
      description: 'View your milestones and badges',
      color: 'text-yellow-400',
      screen: null,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Profile Header */}
      <motion.div
        className="rounded-[20px] p-6 border-2 border-white/30 bg-gradient-to-br from-purple-500/20 to-cyan-500/20 backdrop-blur-xl"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={springConfig}
      >
        <div className="flex items-start gap-4 mb-4">
          {/* Profile Photo */}
          <div className="w-20 h-20 rounded-full bg-gradient-to-br from-purple-500/40 to-cyan-500/40 border-2 border-white/30 overflow-hidden flex-shrink-0">
            {mockDriverProfile.photo ? (
              <img 
                src={mockDriverProfile.photo} 
                alt={mockDriverProfile.name}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <User className="w-10 h-10 text-white" strokeWidth={2.5} />
              </div>
            )}
          </div>

          {/* Profile Info */}
          <div className="flex-1">
            <h2 className="text-[24px] text-white mb-1" style={{ fontWeight: 700 }}>
              {mockDriverProfile.name}
            </h2>
            <div className="flex items-center gap-2 mb-2">
              <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" strokeWidth={2.5} />
              <span className="text-[17px] text-white" style={{ fontWeight: 600 }}>
                {mockDriverProfile.rating}
              </span>
              <span className="text-[13px] text-white/70" style={{ fontWeight: 500 }}>
                • {mockDriverProfile.totalJobs} jobs
              </span>
            </div>
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-green-500/20 border border-green-400/30 inline-flex">
              <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
              <span className="text-[12px] text-green-300" style={{ fontWeight: 600 }}>
                Active Driver
              </span>
            </div>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-[12px] p-3 bg-[#1C1C1E]/60 border border-white/20">
            <Briefcase className="w-4 h-4 text-white/70 mb-1" strokeWidth={2.5} />
            <div className="text-[13px] text-white/70 mb-0.5" style={{ fontWeight: 500 }}>
              Total Jobs
            </div>
            <div className="text-[20px] text-white" style={{ fontWeight: 700 }}>
              {mockDriverProfile.totalJobs}
            </div>
          </div>

          <div className="rounded-[12px] p-3 bg-[#1C1C1E]/60 border border-white/20">
            <Calendar className="w-4 h-4 text-white/70 mb-1" strokeWidth={2.5} />
            <div className="text-[13px] text-white/70 mb-0.5" style={{ fontWeight: 500 }}>
              Member Since
            </div>
            <div className="text-[20px] text-white" style={{ fontWeight: 700 }}>
              {new Date(mockDriverProfile.memberSince).toLocaleDateString('en-US', {
                month: 'short',
                year: 'numeric'
              })}
            </div>
          </div>
        </div>
      </motion.div>

      {/* Vehicle Information */}
      <motion.div
        className="rounded-[16px] p-5 border-2 border-white/30 bg-[#1C1C1E]/80 backdrop-blur-xl"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...springConfig, delay: 0.1 }}
      >
        <div className="flex items-center gap-2 mb-4">
          <Car className="w-5 h-5 text-cyan-400" strokeWidth={2.5} />
          <h3 className="text-[17px] text-white" style={{ fontWeight: 600 }}>
            Your Vehicle
          </h3>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[15px] text-white/70" style={{ fontWeight: 500 }}>
              Make & Model
            </span>
            <span className="text-[15px] text-white" style={{ fontWeight: 600 }}>
              {mockDriverProfile.vehicleInfo.year} {mockDriverProfile.vehicleInfo.make} {mockDriverProfile.vehicleInfo.model}
            </span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-[15px] text-white/70" style={{ fontWeight: 500 }}>
              Color
            </span>
            <span className="text-[15px] text-white" style={{ fontWeight: 600 }}>
              {mockDriverProfile.vehicleInfo.color}
            </span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-[15px] text-white/70" style={{ fontWeight: 500 }}>
              License Plate
            </span>
            <span className="text-[15px] text-white" style={{ fontWeight: 600 }}>
              {mockDriverProfile.vehicleInfo.plate}
            </span>
          </div>
        </div>
      </motion.div>

      {/* License & Insurance */}
      <div className="grid grid-cols-2 gap-3">
        <motion.div
          className="rounded-[16px] p-4 border-2 border-white/30 bg-[#1C1C1E]/80 backdrop-blur-xl"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...springConfig, delay: 0.15 }}
        >
          <IdCard className="w-5 h-5 text-purple-400 mb-3" strokeWidth={2.5} />
          <div className="text-[13px] text-white/70 mb-1" style={{ fontWeight: 500 }}>
            Driver's License
          </div>
          <div className="text-[15px] text-white mb-1" style={{ fontWeight: 600 }}>
            {mockDriverProfile.licenseInfo.number}
          </div>
          <div className="text-[12px] text-white/60" style={{ fontWeight: 500 }}>
            Expires {new Date(mockDriverProfile.licenseInfo.expiryDate).toLocaleDateString('en-US', {
              month: 'short',
              year: 'numeric'
            })}
          </div>
        </motion.div>

        <motion.div
          className="rounded-[16px] p-4 border-2 border-white/30 bg-[#1C1C1E]/80 backdrop-blur-xl"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...springConfig, delay: 0.2 }}
        >
          <Shield className="w-5 h-5 text-green-400 mb-3" strokeWidth={2.5} />
          <div className="text-[13px] text-white/70 mb-1" style={{ fontWeight: 500 }}>
            Insurance
          </div>
          <div className="text-[15px] text-white mb-1" style={{ fontWeight: 600 }}>
            {mockDriverProfile.insurance.provider}
          </div>
          <div className="text-[12px] text-white/60" style={{ fontWeight: 500 }}>
            Policy {mockDriverProfile.insurance.policyNumber.slice(-6)}
          </div>
        </motion.div>
      </div>

      {/* Menu Items */}
      <motion.div
        className="rounded-[16px] border-2 border-white/30 bg-[#1C1C1E]/80 backdrop-blur-xl overflow-hidden"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...springConfig, delay: 0.25 }}
      >
        {menuItems.map((item, index) => {
          const Icon = item.icon;
          
          return (
            <motion.button
              key={item.label}
              onClick={() => item.screen && setCurrentScreen(item.screen)}
              className={`w-full flex items-center gap-4 p-4 hover:bg-white/5 transition-colors ${
                index !== menuItems.length - 1 ? 'border-b-2 border-white/10' : ''
              }`}
              whileTap={{ scale: 0.98 }}
              transition={springConfig}
            >
              <div className={`w-10 h-10 rounded-full bg-[#2C2C2E]/60 border-2 border-white/20 flex items-center justify-center`}>
                <Icon className={`w-5 h-5 ${item.color}`} strokeWidth={2.5} />
              </div>

              <div className="flex-1 text-left">
                <div className="text-[15px] text-white mb-0.5" style={{ fontWeight: 600 }}>
                  {item.label}
                </div>
                <div className="text-[13px] text-white/70" style={{ fontWeight: 400 }}>
                  {item.description}
                </div>
              </div>

              <ChevronRight className="w-5 h-5 text-white/50" strokeWidth={2.5} />
            </motion.button>
          );
        })}
      </motion.div>

      {/* Logout Button */}
      <motion.button
        className="w-full flex items-center justify-center gap-2 px-6 py-4 rounded-[16px] bg-red-500/20 border-2 border-red-400/50 hover:bg-red-500/30"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...springConfig, delay: 0.3 }}
        whileTap={{ scale: 0.95 }}
      >
        <LogOut className="w-5 h-5 text-red-400" strokeWidth={2.5} />
        <span className="text-[15px] text-red-300" style={{ fontWeight: 600 }}>
          Sign Out
        </span>
      </motion.button>

      {/* App Version */}
      <div className="text-center py-4">
        <p className="text-[13px] text-white/50" style={{ fontWeight: 400 }}>
          Bytspot Valet Driver v1.0.0
        </p>
      </div>
    </div>
  );
}
