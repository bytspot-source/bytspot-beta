import { motion, AnimatePresence } from 'motion/react';
import { 
  LayoutDashboard, 
  MapPin, 
  Calendar, 
  DollarSign, 
  Star, 
  Settings,
  Menu,
  X,
  LogOut,
  Home,
  Activity,
  Shield
} from 'lucide-react';
import { useState } from 'react';

export type DashboardView = 'overview' | 'listings' | 'bookings' | 'earnings' | 'reviews' | 'calendar' | 'settings' | 'fusion-engine' | 'compliance';

interface HostDashboardLayoutProps {
  isDarkMode: boolean;
  currentView: DashboardView;
  onViewChange: (view: DashboardView) => void;
  onBackToMain?: () => void;
  children: React.ReactNode;
}

export function HostDashboardLayout({ 
  isDarkMode, 
  currentView, 
  onViewChange,
  onBackToMain,
  children 
}: HostDashboardLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const springConfig = {
    type: "spring" as const,
    stiffness: 320,
    damping: 30,
    mass: 0.8,
  };

  const navItems = [
    { id: 'overview' as const, label: 'Dashboard', icon: LayoutDashboard },
    { id: 'listings' as const, label: 'My Listings', icon: MapPin },
    { id: 'bookings' as const, label: 'Bookings', icon: Calendar },
    { id: 'earnings' as const, label: 'Earnings', icon: DollarSign },
    { id: 'reviews' as const, label: 'Reviews', icon: Star },
    { id: 'calendar' as const, label: 'Calendar', icon: Calendar },
    { id: 'fusion-engine' as const, label: 'Fusion Engine', icon: Activity },
    { id: 'compliance' as const, label: 'Compliance', icon: Shield },
    { id: 'settings' as const, label: 'Settings', icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-[#000000]">
      {/* Mobile Header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-40 px-4 py-3 bg-[#1C1C1E]/95 backdrop-blur-xl border-b-2 border-white/30">
        <div className="flex items-center justify-between max-w-[393px] mx-auto">
          <button
            onClick={() => setSidebarOpen(true)}
            className="w-10 h-10 rounded-full flex items-center justify-center bg-gradient-to-br from-purple-500/40 to-cyan-500/40 border-2 border-white/30 tap-target"
          >
            <Menu className="w-5 h-5 text-white" strokeWidth={2.5} />
          </button>
          
          <h1 className="text-[20px] text-white" style={{ fontWeight: 600 }}>
            Host Dashboard
          </h1>
          
          {onBackToMain && (
            <button
              onClick={onBackToMain}
              className="w-10 h-10 rounded-full flex items-center justify-center bg-[#1C1C1E]/80 backdrop-blur-xl border-2 border-white/30 tap-target"
            >
              <Home className="w-5 h-5 text-white" strokeWidth={2.5} />
            </button>
          )}
        </div>
      </div>

      {/* Desktop Sidebar */}
      <aside className="hidden lg:block fixed left-0 top-0 bottom-0 w-64 bg-[#1C1C1E]/95 backdrop-blur-xl border-r-2 border-white/30 p-6">
        <div className="mb-8">
          <h1 className="text-[28px] text-brand-gradient mb-2" style={{ fontWeight: 700 }}>
            Bytspot
          </h1>
          <p className="text-[15px] text-white/70" style={{ fontWeight: 500 }}>
            Host Dashboard
          </p>
        </div>

        <nav className="space-y-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentView === item.id;
            
            return (
              <motion.button
                key={item.id}
                onClick={() => onViewChange(item.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-colors ${
                  isActive
                    ? 'bg-gradient-to-br from-purple-500/40 to-cyan-500/40 border-2 border-white/30'
                    : 'bg-[#2C2C2E]/60 border-2 border-white/20 hover:border-white/30'
                }`}
                whileTap={{ scale: 0.98 }}
                transition={springConfig}
              >
                <Icon className={`w-5 h-5 ${isActive ? 'text-white' : 'text-white/70'}`} strokeWidth={2.5} />
                <span className={`text-[15px] ${isActive ? 'text-white' : 'text-white/70'}`} style={{ fontWeight: isActive ? 600 : 500 }}>
                  {item.label}
                </span>
              </motion.button>
            );
          })}
        </nav>

        {onBackToMain && (
          <div className="absolute bottom-6 left-6 right-6">
            <motion.button
              onClick={onBackToMain}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-[#2C2C2E]/60 border-2 border-white/20 hover:border-white/30"
              whileTap={{ scale: 0.98 }}
              transition={springConfig}
            >
              <LogOut className="w-5 h-5 text-white/70" strokeWidth={2.5} />
              <span className="text-[15px] text-white/70" style={{ fontWeight: 500 }}>
                Back to Parker
              </span>
            </motion.button>
          </div>
        )}
      </aside>

      {/* Mobile Sidebar Overlay */}
      <AnimatePresence>
        {sidebarOpen && (
          <>
            <motion.div
              className="lg:hidden fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSidebarOpen(false)}
            />
            
            <motion.aside
              className="lg:hidden fixed top-0 left-0 bottom-0 w-[280px] bg-[#1C1C1E]/95 backdrop-blur-xl border-r-2 border-white/30 z-50 p-6"
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={springConfig}
            >
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h1 className="text-[24px] text-brand-gradient mb-1" style={{ fontWeight: 700 }}>
                    Bytspot
                  </h1>
                  <p className="text-[13px] text-white/70" style={{ fontWeight: 500 }}>
                    Host Dashboard
                  </p>
                </div>
                
                <button
                  onClick={() => setSidebarOpen(false)}
                  className="w-9 h-9 rounded-full flex items-center justify-center bg-[#2C2C2E]/60 border-2 border-white/30"
                >
                  <X className="w-5 h-5 text-white" strokeWidth={2.5} />
                </button>
              </div>

              <nav className="space-y-2">
                {navItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = currentView === item.id;
                  
                  return (
                    <motion.button
                      key={item.id}
                      onClick={() => {
                        onViewChange(item.id);
                        setSidebarOpen(false);
                      }}
                      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl ${
                        isActive
                          ? 'bg-gradient-to-br from-purple-500/40 to-cyan-500/40 border-2 border-white/30'
                          : 'bg-[#2C2C2E]/60 border-2 border-white/20'
                      }`}
                      whileTap={{ scale: 0.98 }}
                      transition={springConfig}
                    >
                      <Icon className={`w-5 h-5 ${isActive ? 'text-white' : 'text-white/70'}`} strokeWidth={2.5} />
                      <span className={`text-[15px] ${isActive ? 'text-white' : 'text-white/70'}`} style={{ fontWeight: isActive ? 600 : 500 }}>
                        {item.label}
                      </span>
                    </motion.button>
                  );
                })}
              </nav>

              {onBackToMain && (
                <div className="absolute bottom-6 left-6 right-6">
                  <motion.button
                    onClick={onBackToMain}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-[#2C2C2E]/60 border-2 border-white/20"
                    whileTap={{ scale: 0.98 }}
                    transition={springConfig}
                  >
                    <LogOut className="w-5 h-5 text-white/70" strokeWidth={2.5} />
                    <span className="text-[15px] text-white/70" style={{ fontWeight: 500 }}>
                      Back to Parker
                    </span>
                  </motion.button>
                </div>
              )}
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <main className="lg:ml-64 pt-16 lg:pt-0 min-h-screen">
        <div className="max-w-7xl mx-auto p-4 lg:p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
