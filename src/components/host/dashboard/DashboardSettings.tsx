import { motion } from 'motion/react';
import { trpc } from '../../../utils/trpc';
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
  Shield,
  Save,
  X,
  ExternalLink
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { roleLabel, type ProviderBusinessMode, type ProviderDashboardAccess, type ProviderRole } from './providerDashboardAccess';

interface DashboardSettingsProps {
  isDarkMode: boolean;
  access: ProviderDashboardAccess;
}

type StoredUser = {
  name?: string | null;
  businessName?: string | null;
  email?: string | null;
  phone?: string | null;
  city?: string | null;
  region?: string | null;
  createdAt?: string | null;
};

type SettingsPanel =
  | 'personal'
  | 'business'
  | 'security'
  | 'notifications'
  | 'privacy'
  | 'help'
  | null;

function readStoredUser(): StoredUser | null {
  try {
    const raw = localStorage.getItem('bytspot_user');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') return parsed as StoredUser;
  } catch {
    /* ignore */
  }
  return null;
}

function readStoredName(fallback?: string | null): string | null {
  try {
    const direct = localStorage.getItem('bytspot_user_name');
    if (direct && direct.trim()) return direct.trim();
  } catch {
    /* ignore */
  }
  return fallback ?? null;
}

function formatJoined(iso?: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

export function DashboardSettings({ isDarkMode, access }: DashboardSettingsProps) {
  const [notificationsEnabled, setNotificationsEnabled] = useState(() => localStorage.getItem('bytspot_provider_push_notifications') !== 'false');
  const [instantBook, setInstantBook] = useState(() => localStorage.getItem('bytspot_provider_instant_book') !== 'false');
  const [selectedRole, setSelectedRole] = useState<ProviderRole>(access.role);
  const [businessMode, setBusinessMode] = useState<ProviderBusinessMode>(access.businessMode);
  const [storedUser, setStoredUser] = useState<StoredUser | null>(() => readStoredUser());
  const [displayName, setDisplayName] = useState<string | null>(() => readStoredName(readStoredUser()?.name));
  const [settingsMessage, setSettingsMessage] = useState<string | null>(null);
  const [activePanel, setActivePanel] = useState<SettingsPanel>(null);
  const [profileDraft, setProfileDraft] = useState<StoredUser>(() => readStoredUser() ?? {});
  const [privacyShare, setPrivacyShare] = useState(() => localStorage.getItem('bytspot_provider_privacy_share') !== 'false');
  const [privacyMarketing, setPrivacyMarketing] = useState(() => localStorage.getItem('bytspot_provider_privacy_marketing') === 'true');

  const springConfig = {
    type: "spring" as const,
    stiffness: 320,
    damping: 30,
    mass: 0.8,
  };

  const tone = {
    page: isDarkMode ? 'text-white' : 'text-slate-950',
    strong: isDarkMode ? 'text-white' : 'text-slate-950',
    body: isDarkMode ? 'text-slate-200' : 'text-slate-700',
    muted: isDarkMode ? 'text-slate-300' : 'text-slate-600',
    faint: isDarkMode ? 'text-slate-400' : 'text-slate-500',
    panel: isDarkMode ? 'border-white/25 bg-[#1C1C1E]/88' : 'border-slate-200 bg-white/90',
    detailPanel: isDarkMode ? 'border-slate-600 bg-slate-950 text-white shadow-black/40' : 'border-slate-200 bg-white text-slate-950 shadow-slate-200/70',
    input: isDarkMode ? 'border-slate-600 bg-slate-900 text-white placeholder:text-slate-500' : 'border-slate-300 bg-white text-slate-950 placeholder:text-slate-400',
    rowBorder: isDarkMode ? 'border-white/10' : 'border-slate-200',
    rowHover: isDarkMode ? 'hover:bg-white/5' : 'hover:bg-slate-50',
    iconBubble: isDarkMode ? 'bg-[#2C2C2E]/70 border-white/20' : 'bg-slate-100 border-slate-200',
    workspace: isDarkMode ? 'border-cyan-300/25 bg-cyan-500/10' : 'border-cyan-200 bg-cyan-50/80',
    quick: isDarkMode ? 'border-white/25 bg-gradient-to-br from-purple-500/10 to-cyan-500/10' : 'border-slate-200 bg-gradient-to-br from-purple-50 to-cyan-50',
    danger: isDarkMode ? 'border-red-500/50 bg-red-500/10' : 'border-red-200 bg-red-50',
  };

  useEffect(() => {
    setSelectedRole(access.role);
    setBusinessMode(access.businessMode);
  }, [access.role, access.businessMode]);

  useEffect(() => {
    const refresh = () => {
      const next = readStoredUser();
      setStoredUser(next);
      setDisplayName(readStoredName(next?.name));
      setProfileDraft(next ?? {});
    };
    window.addEventListener('storage', refresh);
    window.addEventListener('bytspot:user-updated', refresh as EventListener);
    return () => {
      window.removeEventListener('storage', refresh);
      window.removeEventListener('bytspot:user-updated', refresh as EventListener);
    };
  }, []);

  const profileName = displayName ?? storedUser?.businessName ?? 'Your business';
  const profileEmail = storedUser?.email ?? null;
  const profilePhone = storedUser?.phone ?? null;
  const profileLocation = storedUser?.city
    ? [storedUser.city, storedUser.region].filter(Boolean).join(', ')
    : null;
  const joinedLabel = formatJoined(storedUser?.createdAt);

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

  const updateWorkspaceAccess = (nextRole: ProviderRole, nextMode: ProviderBusinessMode) => {
    setSelectedRole(nextRole);
    setBusinessMode(nextMode);
    localStorage.setItem('bytspot_provider_role', nextRole);
    localStorage.setItem('bytspot_provider_business_mode', nextMode);
    localStorage.setItem('bytspot_provider_is_cottage', String(nextMode === 'cottage'));
    window.dispatchEvent(new CustomEvent('bytspot:provider-access-updated'));
  };

  const handleSettingAction = async (label: string) => {
    setSettingsMessage(null);
    const panelMap: Record<string, SettingsPanel> = {
      'Personal Information': 'personal',
      'Business Information': 'business',
      'Password & Security': 'security',
      'Notification Preferences': 'notifications',
      'Privacy Settings': 'privacy',
      'Help Center': 'help',
    };
    if (panelMap[label]) {
      setActivePanel(panelMap[label]);
      return;
    }
    if (label === 'Contact Support') {
      window.location.href = 'mailto:bytspotapp@gmail.com?subject=Provider%20Dashboard%20Support';
      return;
    }
    if (label === 'Legal & Policies') {
      window.location.href = '/terms';
      return;
    }
    if (label === 'Payout Methods') {
      try {
        const result = await trpc.vendors.startOnboarding.mutate({
          displayName: profileName,
          refreshPath: '/provider/connect/refresh',
          returnPath: '/provider/connect/return',
        });
        if (result?.url) window.location.href = result.url;
        else setSettingsMessage(result?.message ?? 'Stripe Connect is not available right now.');
      } catch (err: any) {
        setSettingsMessage(err?.message ?? 'Unable to open payout settings.');
      }
      return;
    }
  };

  const saveStoredProfile = (patch: StoredUser, message: string) => {
    const next = { ...(storedUser ?? {}), ...patch };
    localStorage.setItem('bytspot_user', JSON.stringify(next));
    if (next.name || next.businessName) localStorage.setItem('bytspot_user_name', String(next.businessName || next.name));
    setStoredUser(next);
    setDisplayName(readStoredName(next.name));
    setProfileDraft(next);
    setSettingsMessage(message);
    window.dispatchEvent(new CustomEvent('bytspot:user-updated'));
  };

  const Field = ({ label, value, onChange, placeholder, type = 'text' }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; type?: string }) => (
    <label className={`block text-[11px] uppercase tracking-[0.14em] ${tone.muted}`} style={{ fontWeight: 800 }}>
      {label}
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className={`mt-1.5 w-full rounded-xl border px-3.5 py-2.5 text-[14px] normal-case tracking-normal outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20 ${tone.input}`}
      />
    </label>
  );

  return (
    <div className={`space-y-6 ${tone.page}`}>
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={springConfig}
      >
        <h1 className={`text-[34px] mb-2 ${tone.strong}`} style={{ fontWeight: 700 }}>
          Settings
        </h1>
        <p className={`text-[17px] ${tone.body}`} style={{ fontWeight: 500 }}>
          Manage your account and preferences
        </p>
      </motion.div>

      {/* Account Information Card */}
      <motion.div
        className={`rounded-[20px] p-6 border-2 backdrop-blur-xl shadow-xl ${tone.panel}`}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...springConfig, delay: 0.1 }}
      >
        <div className="flex items-center gap-4 mb-4">
          <div className={`w-16 h-16 rounded-full bg-gradient-to-br from-purple-500/30 to-cyan-500/30 border-2 flex items-center justify-center ${isDarkMode ? 'border-white/30' : 'border-slate-200'}`}>
            <User className={`w-8 h-8 ${isDarkMode ? 'text-white' : 'text-slate-800'}`} strokeWidth={2.5} />
          </div>
          
          <div>
            <h2 className={`text-[20px] mb-1 ${tone.strong}`} style={{ fontWeight: 700 }}>
              {profileName}
            </h2>
            {joinedLabel && (
              <p className={`text-[15px] ${tone.muted}`} style={{ fontWeight: 500 }}>
                Joined {joinedLabel}
              </p>
            )}
          </div>
        </div>

        <div className="space-y-2">
          {profileEmail && (
            <div className={`flex items-center gap-2 text-[15px] ${tone.body}`}>
              <Mail className={`w-4 h-4 ${tone.faint}`} strokeWidth={2.5} />
              <span>{profileEmail}</span>
            </div>
          )}

          {profilePhone && (
            <div className={`flex items-center gap-2 text-[15px] ${tone.body}`}>
              <Phone className={`w-4 h-4 ${tone.faint}`} strokeWidth={2.5} />
              <span>{profilePhone}</span>
            </div>
          )}

          {profileLocation && (
            <div className={`flex items-center gap-2 text-[15px] ${tone.body}`}>
              <MapPin className={`w-4 h-4 ${tone.faint}`} strokeWidth={2.5} />
              <span>{profileLocation}</span>
            </div>
          )}

          {!profileEmail && !profilePhone && !profileLocation && (
            <p className={`text-[13px] ${tone.faint}`} style={{ fontWeight: 500 }}>
              Add your contact details from Personal Information.
            </p>
          )}
        </div>
      </motion.div>

      <motion.div
        className={`rounded-[20px] p-6 border-2 backdrop-blur-xl shadow-xl ${tone.workspace}`}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...springConfig, delay: 0.15 }}
      >
        <h2 className={`text-[20px] mb-2 ${tone.strong}`} style={{ fontWeight: 800 }}>Workspace access</h2>
        <p className={`mb-4 text-[13px] leading-5 ${tone.body}`}>Choose your role on this device and whether you're running a standard or cottage business. Navigation and permissions update immediately.</p>
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <p className={`mb-2 text-[12px] uppercase tracking-[0.16em] ${tone.faint}`} style={{ fontWeight: 800 }}>Role</p>
            <div className="grid grid-cols-3 gap-2">
              {(['owner', 'manager', 'staff'] as ProviderRole[]).map((role) => (
                <button key={role} data-testid={`provider-role-${role}`} onClick={() => updateWorkspaceAccess(role, businessMode)} className={`rounded-2xl border px-3 py-2 text-[12px] ${selectedRole === role ? (isDarkMode ? 'border-cyan-200/50 bg-cyan-300/20 text-white' : 'border-cyan-400 bg-cyan-100 text-cyan-950') : (isDarkMode ? 'border-white/10 bg-black/20 text-slate-300' : 'border-slate-200 bg-white text-slate-600')}`} style={{ fontWeight: 800 }}>
                  {roleLabel(role)}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className={`mb-2 text-[12px] uppercase tracking-[0.16em] ${tone.faint}`} style={{ fontWeight: 800 }}>Business mode</p>
            <div className="grid grid-cols-2 gap-2">
              {(['standard', 'cottage'] as ProviderBusinessMode[]).map((mode) => (
                <button key={mode} data-testid={`provider-mode-${mode}`} onClick={() => updateWorkspaceAccess(selectedRole, mode)} className={`rounded-2xl border px-3 py-2 text-[12px] capitalize ${businessMode === mode ? (isDarkMode ? 'border-emerald-200/50 bg-emerald-300/20 text-white' : 'border-emerald-400 bg-emerald-100 text-emerald-950') : (isDarkMode ? 'border-white/10 bg-black/20 text-slate-300' : 'border-slate-200 bg-white text-slate-600')}`} style={{ fontWeight: 800 }}>
                  {mode}
                </button>
              ))}
            </div>
          </div>
        </div>
      </motion.div>

      {settingsMessage && (
        <div className={`rounded-2xl border p-4 text-[13px] ${isDarkMode ? 'border-cyan-300/25 bg-cyan-500/10 text-cyan-50' : 'border-cyan-200 bg-cyan-50 text-cyan-900'}`}>
          {settingsMessage}
        </div>
      )}

      {activePanel && (
        <motion.div
          className={`rounded-[22px] border-2 p-5 shadow-2xl ${tone.detailPanel}`}
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={springConfig}
          data-testid="provider-settings-detail-panel"
        >
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <p className={`text-[11px] uppercase tracking-[0.18em] ${tone.faint}`} style={{ fontWeight: 900 }}>Active settings</p>
              <h3 className={`mt-1 text-[22px] ${tone.strong}`} style={{ fontWeight: 850 }}>
                {activePanel === 'personal' && 'Personal Information'}
                {activePanel === 'business' && 'Business Information'}
                {activePanel === 'security' && 'Password & Security'}
                {activePanel === 'notifications' && 'Notification Preferences'}
                {activePanel === 'privacy' && 'Privacy Settings'}
                {activePanel === 'help' && 'Help Center'}
              </h3>
            </div>
            <button type="button" onClick={() => setActivePanel(null)} className={`rounded-full border p-2 ${isDarkMode ? 'border-slate-600 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-900'}`} aria-label="Close settings panel">
              <X className="h-4 w-4" />
            </button>
          </div>

          {activePanel === 'personal' && (
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Display name" value={profileDraft.name ?? ''} onChange={(value) => setProfileDraft({ ...profileDraft, name: value })} placeholder="Provider owner name" />
              <Field label="Email" value={profileDraft.email ?? ''} onChange={(value) => setProfileDraft({ ...profileDraft, email: value })} placeholder="owner@example.com" type="email" />
              <Field label="Phone" value={profileDraft.phone ?? ''} onChange={(value) => setProfileDraft({ ...profileDraft, phone: value })} placeholder="Business phone" />
              <Field label="City" value={profileDraft.city ?? ''} onChange={(value) => setProfileDraft({ ...profileDraft, city: value })} placeholder="City" />
              <button type="button" onClick={() => saveStoredProfile({ name: profileDraft.name, email: profileDraft.email, phone: profileDraft.phone, city: profileDraft.city, region: profileDraft.region }, 'Personal information saved on this device and synced into the Provider Dashboard shell.')} className="inline-flex items-center justify-center gap-2 rounded-xl bg-cyan-500 px-4 py-3 text-[13px] font-black text-white shadow-lg shadow-cyan-950/20 md:col-span-2">
                <Save className="h-4 w-4" /> Save Personal Information
              </button>
            </div>
          )}

          {activePanel === 'business' && (
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Business / venue name" value={profileDraft.businessName ?? ''} onChange={(value) => setProfileDraft({ ...profileDraft, businessName: value })} placeholder="Midtown Lounge" />
              <Field label="Region / state" value={profileDraft.region ?? ''} onChange={(value) => setProfileDraft({ ...profileDraft, region: value })} placeholder="CA" />
              <p className={`rounded-2xl border p-4 text-[13px] leading-5 md:col-span-2 ${isDarkMode ? 'border-amber-300/30 bg-amber-400/10 text-amber-50' : 'border-amber-200 bg-amber-50 text-amber-900'}`}>Tax identity and bank account changes are handled securely by Stripe Connect from Payout Methods. Bytspot does not store full bank details.</p>
              <button type="button" onClick={() => saveStoredProfile({ businessName: profileDraft.businessName, city: profileDraft.city, region: profileDraft.region }, 'Business information saved for Provider Dashboard display and patch venue defaults.')} className="inline-flex items-center justify-center gap-2 rounded-xl bg-cyan-500 px-4 py-3 text-[13px] font-black text-white shadow-lg shadow-cyan-950/20 md:col-span-2">
                <Save className="h-4 w-4" /> Save Business Information
              </button>
            </div>
          )}

          {activePanel === 'security' && (
            <div className="grid gap-3">
              <p className={`text-[14px] leading-6 ${tone.body}`}>Use password recovery to change your password. Two-factor controls will appear here when account-level 2FA is enabled on the backend.</p>
              <button type="button" onClick={() => { window.location.href = '/forgot-password'; }} className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-[13px] font-black text-slate-950">
                <ExternalLink className="h-4 w-4" /> Change Password
              </button>
            </div>
          )}

          {activePanel === 'notifications' && (
            <div className="grid gap-3 md:grid-cols-2">
              {[['Booking alerts', 'bytspot_provider_notify_bookings'], ['Payout alerts', 'bytspot_provider_notify_payouts'], ['Patch scan alerts', 'bytspot_provider_notify_patches'], ['Product updates', 'bytspot_provider_notify_product']].map(([label, key]) => {
                const enabled = localStorage.getItem(key) !== 'false';
                return <button key={key} type="button" onClick={() => { localStorage.setItem(key, String(!enabled)); setSettingsMessage(`${label} ${enabled ? 'disabled' : 'enabled'}.`); }} className={`rounded-2xl border p-4 text-left ${isDarkMode ? 'border-slate-600 bg-slate-900 text-white' : 'border-slate-200 bg-slate-50 text-slate-950'}`}><span className="font-bold">{label}</span><span className={`mt-1 block text-[12px] ${tone.muted}`}>{enabled ? 'Enabled' : 'Disabled'} — tap to change</span></button>;
              })}
            </div>
          )}

          {activePanel === 'privacy' && (
            <div className="grid gap-3">
              <button type="button" onClick={() => { const next = !privacyShare; setPrivacyShare(next); localStorage.setItem('bytspot_provider_privacy_share', String(next)); }} className={`rounded-2xl border p-4 text-left ${isDarkMode ? 'border-slate-600 bg-slate-900 text-white' : 'border-slate-200 bg-slate-50 text-slate-950'}`}><span className="font-bold">Marketplace visibility data</span><span className={`mt-1 block text-[12px] ${tone.muted}`}>{privacyShare ? 'Enabled' : 'Disabled'} — controls whether operational listing signals improve provider recommendations.</span></button>
              <button type="button" onClick={() => { const next = !privacyMarketing; setPrivacyMarketing(next); localStorage.setItem('bytspot_provider_privacy_marketing', String(next)); }} className={`rounded-2xl border p-4 text-left ${isDarkMode ? 'border-slate-600 bg-slate-900 text-white' : 'border-slate-200 bg-slate-50 text-slate-950'}`}><span className="font-bold">Marketing contact</span><span className={`mt-1 block text-[12px] ${tone.muted}`}>{privacyMarketing ? 'Enabled' : 'Disabled'} — controls non-critical product and growth emails.</span></button>
              <button type="button" onClick={() => { window.location.href = '/privacy'; }} className="inline-flex items-center justify-center gap-2 rounded-xl border border-cyan-300/40 bg-cyan-500/15 px-4 py-3 text-[13px] font-black text-cyan-100"><ExternalLink className="h-4 w-4" /> Open Privacy Policy</button>
            </div>
          )}

          {activePanel === 'help' && (
            <div className="grid gap-3 md:grid-cols-3">
              {['Create a listing from My Listings.', 'Create one patch per entrance, lot, booth, or checkpoint.', 'Use Payout Methods for Stripe bank/tax changes.'].map((item) => <div key={item} className={`rounded-2xl border p-4 text-[13px] leading-5 ${isDarkMode ? 'border-slate-600 bg-slate-900 text-slate-100' : 'border-slate-200 bg-slate-50 text-slate-800'}`}>{item}</div>)}
              <button type="button" onClick={() => { window.location.href = 'mailto:bytspotapp@gmail.com?subject=Provider%20Help%20Center'; }} className="inline-flex items-center justify-center gap-2 rounded-xl bg-cyan-500 px-4 py-3 text-[13px] font-black text-white md:col-span-3"><Mail className="h-4 w-4" /> Email Provider Support</button>
            </div>
          )}
        </motion.div>
      )}

      {/* Account Settings */}
      <div>
        <h2 className={`text-[20px] mb-4 px-2 ${tone.strong}`} style={{ fontWeight: 700 }}>
          Account
        </h2>
        
        <motion.div
          className={`rounded-[20px] border-2 backdrop-blur-xl shadow-xl overflow-hidden ${tone.panel}`}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...springConfig, delay: 0.2 }}
        >
          {accountSettings.map((setting, index) => {
            const Icon = setting.icon;
            
            return (
              <motion.button
                key={setting.label}
                type="button"
                onClick={() => void handleSettingAction(setting.label)}
                className={`w-full flex items-center gap-4 p-4 transition-colors ${tone.rowHover} ${
                  index !== accountSettings.length - 1 ? `border-b-2 ${tone.rowBorder}` : ''
                }`}
                whileTap={{ scale: 0.98 }}
                transition={springConfig}
              >
                <div className={`w-10 h-10 rounded-full border-2 flex items-center justify-center ${tone.iconBubble}`}>
                  <Icon className={`w-5 h-5 ${setting.color}`} strokeWidth={2.5} />
                </div>

                <div className="flex-1 text-left">
                  <div className={`text-[15px] mb-0.5 ${tone.strong}`} style={{ fontWeight: 700 }}>
                    {setting.label}
                  </div>
                  <div className={`text-[13px] ${tone.muted}`} style={{ fontWeight: 500 }}>
                    {setting.description}
                  </div>
                </div>

                <ChevronRight className={`w-5 h-5 ${tone.faint}`} strokeWidth={2.5} />
              </motion.button>
            );
          })}
        </motion.div>
      </div>

      {/* Preferences */}
      <div>
        <h2 className={`text-[20px] mb-4 px-2 ${tone.strong}`} style={{ fontWeight: 700 }}>
          Preferences
        </h2>
        
        <motion.div
          className={`rounded-[20px] border-2 backdrop-blur-xl shadow-xl overflow-hidden ${tone.panel}`}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...springConfig, delay: 0.3 }}
        >
          {preferencesSettings.map((setting, index) => {
            const Icon = setting.icon;
            
            return (
              <motion.button
                key={setting.label}
                type="button"
                onClick={() => void handleSettingAction(setting.label)}
                className={`w-full flex items-center gap-4 p-4 transition-colors ${tone.rowHover} ${
                  index !== preferencesSettings.length - 1 ? `border-b-2 ${tone.rowBorder}` : ''
                }`}
                whileTap={{ scale: 0.98 }}
                transition={springConfig}
              >
                <div className={`w-10 h-10 rounded-full border-2 flex items-center justify-center ${tone.iconBubble}`}>
                  <Icon className={`w-5 h-5 ${setting.color}`} strokeWidth={2.5} />
                </div>

                <div className="flex-1 text-left">
                  <div className={`text-[15px] mb-0.5 ${tone.strong}`} style={{ fontWeight: 700 }}>
                    {setting.label}
                  </div>
                  <div className={`text-[13px] ${tone.muted}`} style={{ fontWeight: 500 }}>
                    {setting.description}
                  </div>
                </div>

                <ChevronRight className={`w-5 h-5 ${tone.faint}`} strokeWidth={2.5} />
              </motion.button>
            );
          })}
        </motion.div>
      </div>

      {/* Quick Toggles */}
      <motion.div
        className={`rounded-[20px] p-6 border-2 backdrop-blur-xl shadow-xl ${tone.quick}`}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...springConfig, delay: 0.4 }}
      >
        <h3 className={`text-[17px] mb-4 ${tone.strong}`} style={{ fontWeight: 700 }}>
          Quick Settings
        </h3>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className={`text-[15px] mb-1 ${tone.strong}`} style={{ fontWeight: 700 }}>
                Push Notifications
              </div>
              <div className={`text-[13px] ${tone.muted}`} style={{ fontWeight: 500 }}>
                Get alerts for new bookings
              </div>
            </div>
            
            <button
              onClick={() => {
                const next = !notificationsEnabled;
                setNotificationsEnabled(next);
                localStorage.setItem('bytspot_provider_push_notifications', String(next));
              }}
              className={`w-12 h-7 rounded-full transition-colors ${
                notificationsEnabled ? 'bg-green-500' : isDarkMode ? 'bg-white/20' : 'bg-slate-300'
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
              <div className={`text-[15px] mb-1 ${tone.strong}`} style={{ fontWeight: 700 }}>
                Instant Book
              </div>
              <div className={`text-[13px] ${tone.muted}`} style={{ fontWeight: 500 }}>
                Allow guests to book without approval
              </div>
            </div>
            
            <button
              onClick={() => {
                const next = !instantBook;
                setInstantBook(next);
                localStorage.setItem('bytspot_provider_instant_book', String(next));
              }}
              className={`w-12 h-7 rounded-full transition-colors ${
                instantBook ? 'bg-green-500' : isDarkMode ? 'bg-white/20' : 'bg-slate-300'
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
        <h2 className={`text-[20px] mb-4 px-2 ${tone.strong}`} style={{ fontWeight: 700 }}>
          Support & Legal
        </h2>
        
        <motion.div
          className={`rounded-[20px] border-2 backdrop-blur-xl shadow-xl overflow-hidden ${tone.panel}`}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...springConfig, delay: 0.5 }}
        >
          {supportSettings.map((setting, index) => {
            const Icon = setting.icon;
            
            return (
              <motion.button
                key={setting.label}
                type="button"
                onClick={() => void handleSettingAction(setting.label)}
                className={`w-full flex items-center gap-4 p-4 transition-colors ${tone.rowHover} ${
                  index !== supportSettings.length - 1 ? `border-b-2 ${tone.rowBorder}` : ''
                }`}
                whileTap={{ scale: 0.98 }}
                transition={springConfig}
              >
                <div className={`w-10 h-10 rounded-full border-2 flex items-center justify-center ${tone.iconBubble}`}>
                  <Icon className={`w-5 h-5 ${setting.color}`} strokeWidth={2.5} />
                </div>

                <div className="flex-1 text-left">
                  <div className={`text-[15px] mb-0.5 ${tone.strong}`} style={{ fontWeight: 700 }}>
                    {setting.label}
                  </div>
                  <div className={`text-[13px] ${tone.muted}`} style={{ fontWeight: 500 }}>
                    {setting.description}
                  </div>
                </div>

                <ChevronRight className={`w-5 h-5 ${tone.faint}`} strokeWidth={2.5} />
              </motion.button>
            );
          })}
        </motion.div>
      </div>

      {/* Danger Zone */}
      <motion.div
        className={`rounded-[20px] p-6 border-2 backdrop-blur-xl shadow-xl ${tone.danger}`}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...springConfig, delay: 0.6 }}
      >
        <h3 className="text-[17px] text-red-400 mb-4" style={{ fontWeight: 600 }}>
          Danger Zone
        </h3>

        <motion.button
          onClick={async () => {
            if (confirm('Are you sure you want to reset your provider profile? This will restart the onboarding process.')) {
              await trpc.providers.resetHostProfile.mutate();
              window.location.reload();
            }
          }}
          className="w-full flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-red-500/20 border-2 border-red-500/50 hover:bg-red-500/30"
          whileTap={{ scale: 0.95 }}
          transition={springConfig}
        >
          <LogOut className="w-5 h-5 text-red-400" strokeWidth={2.5} />
          <span className="text-[15px] text-red-400" style={{ fontWeight: 600 }}>
            Reset Provider Account
          </span>
        </motion.button>

        <p className={`text-center text-[13px] mt-3 ${isDarkMode ? 'text-red-200' : 'text-red-700'}`} style={{ fontWeight: 500 }}>
          This action will clear your provider profile and restart onboarding
        </p>
      </motion.div>

      {/* App Version */}
      <div className="text-center py-4">
        <p className={`text-[13px] ${tone.faint}`} style={{ fontWeight: 500 }}>
          Bytspot Provider Dashboard v1.0.0
        </p>
      </div>
    </div>
  );
}
