import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Briefcase, 
  History, 
  DollarSign, 
  User,
  Home,
  Bell,
  Menu
} from 'lucide-react';
import { ActiveJobsView } from './dashboard/ActiveJobsView';
import { JobHistoryView } from './dashboard/JobHistoryView';
import { EarningsView } from './dashboard/EarningsView';
import { DriverProfileView } from './dashboard/DriverProfileView';
import { mockDriverProfile, mockNotifications } from '../../utils/valetMockData';

type DashboardView = 'active' | 'history' | 'earnings' | 'profile';

interface ValetDashboardProps {
  isDarkMode: boolean;
  onBackToMain?: () => void;
}

export function ValetDashboard({ isDarkMode, onBackToMain }: ValetDashboardProps) {
  const [currentView, setCurrentView] = useState<DashboardView>('active');
  const [showMenu, setShowMenu] = useState(false);
  const unreadNotifications = mockNotifications.filter(n => !n.read).length;

  const springConfig = {
    type: "spring" as const,
    stiffness: 320,
    damping: 30,
    mass: 0.8,
  };

  const navItems = [
    { id: 'active' as const, label: 'Active', icon: Briefcase },
    { id: 'history' as const, label: 'History', icon: History },
    { id: 'earnings' as const, label: 'Earnings', icon: DollarSign },
    { id: 'profile' as const, label: 'Profile', icon: User },
  ];

  const renderContent = () => {
    switch (currentView) {
      case 'active':
        return <ActiveJobsView isDarkMode={isDarkMode} />;
      case 'history':
        return <JobHistoryView isDarkMode={isDarkMode} />;
      case 'earnings':
        return <EarningsView isDarkMode={isDarkMode} />;
      case 'profile':
        return <DriverProfileView isDarkMode={isDarkMode} />;
      default:
        return <ActiveJobsView isDarkMode={isDarkMode} />;
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* Status Bar Space */}
      <div className="h-12" />

      {/* Header */}
      <motion.div 
        className="px-4 mb-2"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={springConfig}
      >
        <div className="flex items-center justify-between rounded-[16px] px-4 py-3 border-2 border-white/30 shadow-xl bg-[#1C1C1E]/80 backdrop-blur-xl">
          <div className="flex items-center gap-3">
            {onBackToMain && (
              <motion.button
                onClick={onBackToMain}
                className="w-9 h-9 rounded-full flex items-center justify-center bg-[#2C2C2E]/60 border-2 border-white/30 tap-target"
                whileTap={{ scale: 0.9 }}
                transition={springConfig}
              >
                <Home className="w-[18px] h-[18px] text-white" strokeWidth={2.5} />
              </motion.button>
            )}
            
            <div>
              <div className="text-[15px] text-white mb-0.5" style={{ fontWeight: 600 }}>
                {mockDriverProfile.name}
              </div>
              <div className="flex items-center gap-2 text-[13px]">
                <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                <span className="text-green-400" style={{ fontWeight: 600 }}>
                  Online
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Notifications */}
            <motion.button
              className="w-9 h-9 rounded-full flex items-center justify-center bg-[#2C2C2E]/60 border-2 border-white/30 tap-target relative"
              whileTap={{ scale: 0.9 }}
              transition={springConfig}
            >
              <Bell className="w-[18px] h-[18px] text-white" strokeWidth={2.5} />
              {unreadNotifications > 0 && (
                <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 border-2 border-[#000000] flex items-center justify-center">
                  <span className="text-[10px] text-white" style={{ fontWeight: 700 }}>
                    {unreadNotifications}
                  </span>
                </div>
              )}
            </motion.button>

            {/* Menu */}
            <motion.button
              onClick={() => setShowMenu(!showMenu)}
              className="w-9 h-9 rounded-full flex items-center justify-center bg-gradient-to-br from-purple-500/40 to-cyan-500/40 border-2 border-white/30 shadow-lg tap-target"
              whileTap={{ scale: 0.9 }}
              transition={springConfig}
            >
              <Menu className="w-[18px] h-[18px] text-white" strokeWidth={2.5} />
            </motion.button>
          </div>
        </div>
      </motion.div>

      {/* Page Title */}
      <motion.div 
        className="px-4 pt-4 pb-3"
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ ...springConfig, delay: 0.1 }}
      >
        <h1 className="text-large-title text-white mb-1">
          {currentView === 'active' && 'Active Jobs'}
          {currentView === 'history' && 'Job History'}
          {currentView === 'earnings' && 'Earnings'}
          {currentView === 'profile' && 'Profile'}
        </h1>
        <p className="text-[17px] text-white/70" style={{ fontWeight: 400 }}>
          {currentView === 'active' && 'Manage your current valet requests'}
          {currentView === 'history' && 'View your completed jobs'}
          {currentView === 'earnings' && 'Track your income and tips'}
          {currentView === 'profile' && 'Your driver information'}
        </p>
      </motion.div>

      {/* Main Content */}
      <div className="flex-1 px-4 pb-24 overflow-y-auto">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentView}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
          >
            {renderContent()}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Bottom Navigation */}
      <div className="fixed bottom-0 left-0 right-0 z-40">
        <div className="max-w-[393px] mx-auto px-4 pb-6">
          <motion.div
            className="rounded-[24px] px-2 py-2 border-2 border-white/30 shadow-2xl bg-[#1C1C1E]/95 backdrop-blur-xl"
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ ...springConfig, delay: 0.2 }}
          >
            <div className="grid grid-cols-4 gap-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = currentView === item.id;
                
                return (
                  <motion.button
                    key={item.id}
                    onClick={() => setCurrentView(item.id)}
                    className={`flex flex-col items-center gap-1 px-3 py-2.5 rounded-[16px] ${
                      isActive
                        ? 'bg-gradient-to-br from-purple-500/40 to-cyan-500/40'
                        : 'bg-transparent'
                    }`}
                    whileTap={{ scale: 0.95 }}
                    transition={springConfig}
                  >
                    <Icon 
                      className={`w-[22px] h-[22px] ${isActive ? 'text-white' : 'text-white/60'}`} 
                      strokeWidth={2.5} 
                    />
                    <span 
                      className={`text-[11px] ${isActive ? 'text-white' : 'text-white/60'}`}
                      style={{ fontWeight: isActive ? 600 : 500 }}
                    >
                      {item.label}
                    </span>
                  </motion.button>
                );
              })}
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
