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
  Shield,
  Radio,
} from 'lucide-react';
import { useState } from 'react';
import { type ProviderDashboardAccess, roleLabel } from './providerDashboardAccess';
import type { ProviderReviewState } from '../../../utils/providerApproval';

export type DashboardView = 'overview' | 'listings' | 'bookings' | 'earnings' | 'reviews' | 'calendar' | 'patches' | 'settings' | 'compliance';

interface ProviderDashboardLayoutProps {
  isDarkMode: boolean;
  currentView: DashboardView;
  onViewChange: (view: DashboardView) => void;
  onBackToMain?: () => void;
  children: React.ReactNode;
  access: ProviderDashboardAccess;
  reviewState?: ProviderReviewState | null;
}

export function ProviderDashboardLayout({
  isDarkMode, 
  currentView, 
  onViewChange,
  onBackToMain,
  children,
  access,
  reviewState,
}: ProviderDashboardLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const springConfig = {
    type: "spring" as const,
    stiffness: 320,
    damping: 30,
    mass: 0.8,
  };

  const navItems = [
    { id: 'overview' as const, label: 'Dashboard', icon: LayoutDashboard },
    { id: 'listings' as const, label: 'My Services', icon: MapPin },
    { id: 'bookings' as const, label: 'Bookings', icon: Calendar },
    { id: 'earnings' as const, label: 'Earnings', icon: DollarSign },
    { id: 'reviews' as const, label: 'Reviews', icon: Star },
    { id: 'calendar' as const, label: 'Calendar', icon: Calendar },
    { id: 'patches' as const, label: 'Patches', icon: Radio },
    { id: 'compliance' as const, label: 'Compliance', icon: Shield },
    { id: 'settings' as const, label: 'Settings', icon: Settings },
  ].filter((item) => access.allowedViews.includes(item.id));

  const palette = isDarkMode
    ? {
        shell: 'bg-slate-900 text-white',
        chrome: 'bg-slate-800 border-slate-600 shadow-2xl shadow-black/40',
        chromeSoft: 'bg-slate-700 border-slate-500',
        title: 'text-white',
        subtle: 'text-slate-100',
        faint: 'text-slate-200',
        pill: 'border-slate-500 bg-slate-700 text-slate-50',
        navInactive: 'bg-slate-700 border-slate-500 hover:border-cyan-300 text-slate-50',
        navActive: 'bg-gradient-to-br from-violet-700 to-cyan-700 border-cyan-300 text-white shadow-lg shadow-cyan-950/40',
        advLabel: 'text-slate-200',
        advInactive: 'bg-slate-700 border-slate-500 hover:border-cyan-300 text-slate-50',
        advActive: 'bg-cyan-900 border-cyan-400 text-white',
        advIconActive: 'text-cyan-200',
        advIconInactive: 'text-slate-200',
        advDescription: 'text-slate-200',
        divider: 'border-slate-600',
        closeBtn: 'bg-slate-700 border-slate-500 text-white',
        overlay: 'bg-slate-800/95',
      }
    : {
        shell: 'bg-slate-50',
        chrome: 'bg-white/95 border-slate-200',
        chromeSoft: 'bg-white/90 border-slate-200',
        title: 'text-slate-900',
        subtle: 'text-slate-600',
        faint: 'text-slate-500',
        pill: 'border-slate-200 bg-slate-100 text-slate-600',
        navInactive: 'bg-white border-slate-200 hover:border-slate-300 text-slate-700',
        navActive: 'bg-gradient-to-br from-purple-500/15 to-cyan-500/15 border-cyan-400 text-slate-900',
        advLabel: 'text-slate-500',
        advInactive: 'bg-white border-slate-200 hover:border-slate-300 text-slate-700',
        advActive: 'bg-cyan-50 border-cyan-400 text-slate-900',
        advIconActive: 'text-cyan-700',
        advIconInactive: 'text-slate-500',
        advDescription: 'text-slate-500',
        divider: 'border-slate-200',
        closeBtn: 'bg-white border-slate-200 text-slate-700',
        overlay: 'bg-slate-900/40',
      };

  return (
    <div className={`min-h-screen ${palette.shell}`}>
      {/* Mobile Header */}
      <div className={`lg:hidden fixed top-0 left-0 right-0 z-40 px-4 py-3 border-b-2 ${palette.chrome}`} style={{ paddingTop: 'calc(0.75rem + env(safe-area-inset-top))' }}>
        <div className="flex items-center justify-between max-w-[393px] mx-auto">
          <button
            type="button"
            aria-label="Open provider navigation"
            onClick={() => setSidebarOpen(true)}
            className="w-10 h-10 rounded-full flex items-center justify-center bg-gradient-to-br from-purple-600 to-cyan-600 border-2 border-cyan-300 tap-target"
          >
            <Menu className="w-5 h-5 text-white" strokeWidth={2.5} />
          </button>

          <h1 className={`text-[20px] ${palette.title}`} style={{ fontWeight: 600 }}>
            Provider Dashboard
          </h1>

          {onBackToMain && (
            <button
              type="button"
              aria-label="Back to Bytspot"
              onClick={onBackToMain}
              className={`w-10 h-10 rounded-full flex items-center justify-center border-2 tap-target ${palette.chromeSoft}`}
            >
              <Home className={`w-5 h-5 ${palette.title}`} strokeWidth={2.5} />
            </button>
          )}
        </div>
      </div>

      {/* Desktop Sidebar */}
      <aside className={`hidden lg:block fixed left-0 top-0 bottom-0 w-64 border-r-2 ${palette.chrome}`}>
        <div className="flex flex-col p-6" style={{ height: '100%' }}>
        <div className="mb-6 shrink-0">
          <h1 className="text-[28px] text-brand-gradient mb-2" style={{ fontWeight: 700 }}>
            Bytspot
          </h1>
          <p className={`text-[15px] ${palette.subtle}`} style={{ fontWeight: 500 }}>
            Provider Dashboard
          </p>
          <div className={`mt-3 inline-flex rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.12em] ${palette.pill}`} style={{ fontWeight: 800 }}>
            {roleLabel(access.role)} · {access.isCottage ? 'Cottage' : 'Standard'}
          </div>
          {reviewState && (
            <div data-testid="provider-dashboard-review-badge" className={`mt-2 inline-flex rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.12em] ${reviewState.status === 'approved' ? 'border-emerald-300 bg-emerald-900 text-emerald-50' : 'border-amber-300 bg-amber-900 text-amber-50'}`} style={{ fontWeight: 850 }}>
              {reviewState.label}
            </div>
          )}
        </div>

        <nav className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1 pb-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentView === item.id;

            return (
              <motion.button
                  type="button"
                  aria-label={item.label}
                key={item.id}
                onClick={() => onViewChange(item.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-colors border-2 ${
                  isActive ? palette.navActive : palette.navInactive
                }`}
                whileTap={{ scale: 0.98 }}
                transition={springConfig}
              >
                <Icon className="w-5 h-5" strokeWidth={2.5} />
                <span className="text-[15px]" style={{ fontWeight: isActive ? 600 : 500 }}>
                  {item.label}
                </span>
              </motion.button>
            );
          })}
        </nav>

        {onBackToMain && (
          <div className={`mt-4 shrink-0 border-t pt-4 ${palette.divider}`}>
            <motion.button
              type="button"
              aria-label="Back to Bytspot"
              onClick={onBackToMain}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 ${palette.navInactive}`}
              whileTap={{ scale: 0.98 }}
              transition={springConfig}
            >
              <LogOut className="w-5 h-5 shrink-0" strokeWidth={2.5} />
              <span className="text-[15px]" style={{ fontWeight: 500 }}>
                Back to Bytspot
              </span>
            </motion.button>
          </div>
        )}
        </div>
      </aside>

      {/* Mobile Sidebar Overlay */}
      <AnimatePresence>
        {sidebarOpen && (
          <>
            <motion.div
              className={`lg:hidden fixed inset-0 z-50 ${palette.overlay}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSidebarOpen(false)}
            />

            <motion.aside
              className={`lg:hidden fixed top-0 left-0 bottom-0 flex flex-col border-r-2 z-50 p-6 ${palette.chrome}`}
              style={{ width: 'min(280px, calc(100vw - 2rem))', paddingTop: 'calc(1.5rem + env(safe-area-inset-top))', paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom))' }}
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={springConfig}
            >
              <div className="mb-6 flex shrink-0 items-center justify-between">
                <div>
                  <h1 className="text-[24px] text-brand-gradient mb-1" style={{ fontWeight: 700 }}>
                    Bytspot
                  </h1>
                  <p className={`text-[13px] ${palette.subtle}`} style={{ fontWeight: 500 }}>
                    Provider Dashboard
                  </p>
                  <div className={`mt-2 inline-flex rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-[0.12em] ${palette.pill}`} style={{ fontWeight: 800 }}>
                    {roleLabel(access.role)} · {access.isCottage ? 'Cottage' : 'Standard'}
                  </div>
                  {reviewState && (
                    <div data-testid="provider-dashboard-mobile-review-badge" className={`mt-2 inline-flex rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-[0.12em] ${reviewState.status === 'approved' ? 'border-emerald-300 bg-emerald-900 text-emerald-50' : 'border-amber-300 bg-amber-900 text-amber-50'}`} style={{ fontWeight: 850 }}>
                      {reviewState.label}
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  aria-label="Close provider navigation"
                  onClick={() => setSidebarOpen(false)}
                  className={`w-9 h-9 rounded-full flex items-center justify-center border-2 ${palette.closeBtn}`}
                >
                  <X className="w-5 h-5" strokeWidth={2.5} />
                </button>
              </div>

              <nav className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1 pb-2">
                {navItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = currentView === item.id;

                  return (
                    <motion.button
                      type="button"
                      aria-label={item.label}
                      key={item.id}
                      onClick={() => {
                        onViewChange(item.id);
                        setSidebarOpen(false);
                      }}
                      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 ${
                        isActive ? palette.navActive : palette.navInactive
                      }`}
                      whileTap={{ scale: 0.98 }}
                      transition={springConfig}
                    >
                      <Icon className="w-5 h-5" strokeWidth={2.5} />
                      <span className="text-[15px]" style={{ fontWeight: isActive ? 600 : 500 }}>
                        {item.label}
                      </span>
                    </motion.button>
                  );
                })}
              </nav>

              {onBackToMain && (
                <div className={`mt-4 shrink-0 border-t pt-4 ${palette.divider}`}>
                  <motion.button
                    type="button"
                    aria-label="Back to Bytspot"
                    onClick={onBackToMain}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 ${palette.navInactive}`}
                    whileTap={{ scale: 0.98 }}
                    transition={springConfig}
                  >
                    <LogOut className="w-5 h-5 shrink-0" strokeWidth={2.5} />
                    <span className="text-[15px]" style={{ fontWeight: 500 }}>
                      Back to Bytspot
                    </span>
                  </motion.button>
                </div>
              )}
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <main className="provider-dashboard-main lg:ml-64 min-h-screen overflow-y-visible">
        <div className="max-w-7xl mx-auto p-4 pb-[calc(16rem+env(safe-area-inset-bottom))] lg:p-8 lg:pb-[calc(16rem+env(safe-area-inset-bottom))]">
          {children}
        </div>
      </main>
    </div>
  );
}
