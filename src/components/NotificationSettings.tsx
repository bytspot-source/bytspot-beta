import { motion } from 'motion/react';
import { ArrowLeft, Bell, Mail, MessageSquare, Save, Loader2, BellRing, CheckCircle2 } from 'lucide-react';
import { useState, useEffect } from 'react';
import { toast } from 'sonner@2.0.3';
import { trpc } from '../utils/trpc';
import { isPushSupported, getPermissionState, isSubscribed, subscribeToPush } from '../utils/pushNotifications';

interface NotificationSettingsProps {
  isDarkMode: boolean;
  onBack: () => void;
}

interface NotificationPreferences {
  push: {
    reservations: boolean;
    promotions: boolean;
    reminders: boolean;
    insider: boolean;
    nearby: boolean;
  };
  email: {
    reservations: boolean;
    promotions: boolean;
    newsletter: boolean;
    receipts: boolean;
  };
  sms: {
    reservations: boolean;
    reminders: boolean;
    emergencies: boolean;
  };
}

const DEFAULT_PREFS: NotificationPreferences = {
  push: { reservations: true, promotions: true, reminders: true, insider: true, nearby: false },
  email: { reservations: true, promotions: false, newsletter: true, receipts: true },
  sms: { reservations: true, reminders: true, emergencies: true },
};

export function NotificationSettings({ isDarkMode, onBack }: NotificationSettingsProps) {
  const [preferences, setPreferences] = useState<NotificationPreferences>(DEFAULT_PREFS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pushStatus, setPushStatus] = useState<'unknown' | 'unsupported' | 'denied' | 'prompt' | 'subscribed'>('unknown');
  const [subscribing, setSubscribing] = useState(false);

  // Load saved preferences from backend + check push status
  useEffect(() => {
    (async () => {
      try {
        const prefs = await trpc.user.notifications.getPrefs.query();
        setPreferences(prefs as NotificationPreferences);
      } catch {
        // Use defaults on error (e.g. not logged in)
      } finally {
        setLoading(false);
      }
    })();
    // Check browser push support & subscription state
    (async () => {
      if (!isPushSupported()) { setPushStatus('unsupported'); return; }
      const perm = getPermissionState();
      if (perm === 'denied') { setPushStatus('denied'); return; }
      const sub = await isSubscribed();
      setPushStatus(sub ? 'subscribed' : 'prompt');
    })();
  }, []);

  const handleEnablePush = async () => {
    setSubscribing(true);
    const result = await subscribeToPush();
    setSubscribing(false);
    if (result.success) {
      setPushStatus('subscribed');
      toast.success('Push notifications enabled!');
    } else {
      if (getPermissionState() === 'denied') setPushStatus('denied');
      toast.error(result.error || 'Failed to enable push notifications.');
    }
  };

  const springConfig = {
    type: "spring" as const,
    stiffness: 320,
    damping: 30,
    mass: 0.8,
  };

  const togglePreference = (category: keyof NotificationPreferences, key: string) => {
    setPreferences({
      ...preferences,
      [category]: {
        ...preferences[category],
        [key]: !preferences[category][key as keyof typeof preferences[typeof category]],
      },
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await trpc.user.notifications.updatePrefs.mutate(preferences);
      toast.success('Notification settings saved');
      setTimeout(() => onBack(), 1000);
    } catch {
      toast.error('Failed to save settings. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const ToggleSwitch = ({ enabled, onToggle }: { enabled: boolean; onToggle: () => void }) => (
    <motion.button
      onClick={onToggle}
      className={`w-[51px] h-[31px] rounded-full p-0.5 transition-colors ${
        enabled ? 'bg-green-500' : 'bg-white/20'
      }`}
      whileTap={{ scale: 0.95 }}
      transition={springConfig}
    >
      <motion.div
        className="w-[27px] h-[27px] rounded-full bg-white shadow-lg"
        animate={{ x: enabled ? 20 : 0 }}
        transition={springConfig}
      />
    </motion.button>
  );

  return (
    <div className="h-full overflow-y-auto pb-24">
      {/* Header */}
      <motion.div
        className="px-4 pt-4 pb-4 flex items-center gap-3 sticky top-0 bg-[#000000] z-10"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={springConfig}
      >
        <motion.button
          onClick={onBack}
          className="w-10 h-10 rounded-full flex items-center justify-center bg-[#1C1C1E]/80 backdrop-blur-xl border-2 border-white/30 shadow-xl tap-target"
          whileTap={{ scale: 0.9 }}
          transition={springConfig}
        >
          <ArrowLeft className="w-5 h-5 text-white" strokeWidth={2.5} />
        </motion.button>
        <h1 className="text-title-2 text-white">
          Notifications
        </h1>
      </motion.div>

      <div className="px-4 space-y-6">
        {/* Push Notifications */}
        <motion.div
          className="rounded-[24px] p-6 border-2 border-white/30 bg-[#1C1C1E]/80 backdrop-blur-xl shadow-xl"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...springConfig, delay: 0.1 }}
        >
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full flex items-center justify-center bg-gradient-to-br from-purple-500/40 to-pink-500/40 border-2 border-purple-400/30">
              <Bell className="w-5 h-5 text-white" strokeWidth={2.5} />
            </div>
            <h3 className="text-[17px] text-white" style={{ fontWeight: 600 }}>
              Push Notifications
            </h3>
          </div>

          {/* Browser Push Subscription Banner */}
          {pushStatus === 'prompt' && (
            <motion.button
              onClick={handleEnablePush}
              disabled={subscribing}
              className="w-full mb-4 rounded-[16px] px-4 py-3 flex items-center gap-3 bg-gradient-to-r from-purple-500/20 to-cyan-500/20 border border-purple-400/30 disabled:opacity-60"
              whileTap={{ scale: 0.98 }}
            >
              {subscribing ? <Loader2 className="w-5 h-5 text-purple-300 animate-spin" strokeWidth={2.5} /> : <BellRing className="w-5 h-5 text-purple-300" strokeWidth={2.5} />}
              <div className="text-left flex-1">
                <p className="text-[14px] text-white" style={{ fontWeight: 600 }}>Enable Push Notifications</p>
                <p className="text-[12px] text-white/60" style={{ fontWeight: 400 }}>Get real-time crowd alerts in your browser</p>
              </div>
            </motion.button>
          )}
          {pushStatus === 'subscribed' && (
            <div className="mb-4 rounded-[16px] px-4 py-3 flex items-center gap-3 bg-green-500/10 border border-green-400/20">
              <CheckCircle2 className="w-5 h-5 text-green-400" strokeWidth={2.5} />
              <p className="text-[13px] text-green-300" style={{ fontWeight: 500 }}>Push notifications are enabled</p>
            </div>
          )}
          {pushStatus === 'denied' && (
            <div className="mb-4 rounded-[16px] px-4 py-3 flex items-center gap-3 bg-red-500/10 border border-red-400/20">
              <Bell className="w-5 h-5 text-red-400" strokeWidth={2.5} />
              <p className="text-[13px] text-red-300" style={{ fontWeight: 500 }}>Notifications blocked — enable in browser settings</p>
            </div>
          )}

          <div className="space-y-4">
            <div className="flex items-center justify-between py-2">
              <div>
                <p className="text-[15px] text-white mb-0.5" style={{ fontWeight: 500 }}>
                  Reservation Updates
                </p>
                <p className="text-[13px] text-white/60" style={{ fontWeight: 400 }}>
                  Confirmations, changes, and cancellations
                </p>
              </div>
              <ToggleSwitch
                enabled={preferences.push.reservations}
                onToggle={() => togglePreference('push', 'reservations')}
              />
            </div>

            <div className="h-px bg-white/20" />

            <div className="flex items-center justify-between py-2">
              <div>
                <p className="text-[15px] text-white mb-0.5" style={{ fontWeight: 500 }}>
                  Promotions & Deals
                </p>
                <p className="text-[13px] text-white/60" style={{ fontWeight: 400 }}>
                  Special offers and discounts
                </p>
              </div>
              <ToggleSwitch
                enabled={preferences.push.promotions}
                onToggle={() => togglePreference('push', 'promotions')}
              />
            </div>

            <div className="h-px bg-white/20" />

            <div className="flex items-center justify-between py-2">
              <div>
                <p className="text-[15px] text-white mb-0.5" style={{ fontWeight: 500 }}>
                  Reminders
                </p>
                <p className="text-[13px] text-white/60" style={{ fontWeight: 400 }}>
                  Parking session expiration alerts
                </p>
              </div>
              <ToggleSwitch
                enabled={preferences.push.reminders}
                onToggle={() => togglePreference('push', 'reminders')}
              />
            </div>

            <div className="h-px bg-white/20" />

            <div className="flex items-center justify-between py-2">
              <div>
                <p className="text-[15px] text-white mb-0.5" style={{ fontWeight: 500 }}>
                  Insider Updates
                </p>
                <p className="text-[13px] text-white/60" style={{ fontWeight: 400 }}>
                  New posts and venue information
                </p>
              </div>
              <ToggleSwitch
                enabled={preferences.push.insider}
                onToggle={() => togglePreference('push', 'insider')}
              />
            </div>

            <div className="h-px bg-white/20" />

            <div className="flex items-center justify-between py-2">
              <div>
                <p className="text-[15px] text-white mb-0.5" style={{ fontWeight: 500 }}>
                  Nearby Spots
                </p>
                <p className="text-[13px] text-white/60" style={{ fontWeight: 400 }}>
                  Available parking near your location
                </p>
              </div>
              <ToggleSwitch
                enabled={preferences.push.nearby}
                onToggle={() => togglePreference('push', 'nearby')}
              />
            </div>
          </div>
        </motion.div>

        {/* Email Notifications */}
        <motion.div
          className="rounded-[24px] p-6 border-2 border-white/30 bg-[#1C1C1E]/80 backdrop-blur-xl shadow-xl"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...springConfig, delay: 0.15 }}
        >
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full flex items-center justify-center bg-gradient-to-br from-blue-500/40 to-cyan-500/40 border-2 border-blue-400/30">
              <Mail className="w-5 h-5 text-white" strokeWidth={2.5} />
            </div>
            <h3 className="text-[17px] text-white" style={{ fontWeight: 600 }}>
              Email Notifications
            </h3>
          </div>
          
          <div className="space-y-4">
            <div className="flex items-center justify-between py-2">
              <div>
                <p className="text-[15px] text-white mb-0.5" style={{ fontWeight: 500 }}>
                  Reservation Confirmations
                </p>
                <p className="text-[13px] text-white/60" style={{ fontWeight: 400 }}>
                  Booking details and receipts
                </p>
              </div>
              <ToggleSwitch
                enabled={preferences.email.reservations}
                onToggle={() => togglePreference('email', 'reservations')}
              />
            </div>

            <div className="h-px bg-white/20" />

            <div className="flex items-center justify-between py-2">
              <div>
                <p className="text-[15px] text-white mb-0.5" style={{ fontWeight: 500 }}>
                  Promotional Emails
                </p>
                <p className="text-[13px] text-white/60" style={{ fontWeight: 400 }}>
                  Marketing and promotional content
                </p>
              </div>
              <ToggleSwitch
                enabled={preferences.email.promotions}
                onToggle={() => togglePreference('email', 'promotions')}
              />
            </div>

            <div className="h-px bg-white/20" />

            <div className="flex items-center justify-between py-2">
              <div>
                <p className="text-[15px] text-white mb-0.5" style={{ fontWeight: 500 }}>
                  Newsletter
                </p>
                <p className="text-[13px] text-white/60" style={{ fontWeight: 400 }}>
                  Monthly tips and feature updates
                </p>
              </div>
              <ToggleSwitch
                enabled={preferences.email.newsletter}
                onToggle={() => togglePreference('email', 'newsletter')}
              />
            </div>

            <div className="h-px bg-white/20" />

            <div className="flex items-center justify-between py-2">
              <div>
                <p className="text-[15px] text-white mb-0.5" style={{ fontWeight: 500 }}>
                  Receipts
                </p>
                <p className="text-[13px] text-white/60" style={{ fontWeight: 400 }}>
                  Payment receipts and invoices
                </p>
              </div>
              <ToggleSwitch
                enabled={preferences.email.receipts}
                onToggle={() => togglePreference('email', 'receipts')}
              />
            </div>
          </div>
        </motion.div>

        {/* SMS Notifications */}
        <motion.div
          className="rounded-[24px] p-6 border-2 border-white/30 bg-[#1C1C1E]/80 backdrop-blur-xl shadow-xl"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...springConfig, delay: 0.2 }}
        >
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full flex items-center justify-center bg-gradient-to-br from-green-500/40 to-emerald-500/40 border-2 border-green-400/30">
              <MessageSquare className="w-5 h-5 text-white" strokeWidth={2.5} />
            </div>
            <h3 className="text-[17px] text-white" style={{ fontWeight: 600 }}>
              SMS Notifications
            </h3>
          </div>
          
          <div className="space-y-4">
            <div className="flex items-center justify-between py-2">
              <div>
                <p className="text-[15px] text-white mb-0.5" style={{ fontWeight: 500 }}>
                  Reservation Alerts
                </p>
                <p className="text-[13px] text-white/60" style={{ fontWeight: 400 }}>
                  Booking confirmations via SMS
                </p>
              </div>
              <ToggleSwitch
                enabled={preferences.sms.reservations}
                onToggle={() => togglePreference('sms', 'reservations')}
              />
            </div>

            <div className="h-px bg-white/20" />

            <div className="flex items-center justify-between py-2">
              <div>
                <p className="text-[15px] text-white mb-0.5" style={{ fontWeight: 500 }}>
                  Time Reminders
                </p>
                <p className="text-[13px] text-white/60" style={{ fontWeight: 400 }}>
                  30-min expiration warnings
                </p>
              </div>
              <ToggleSwitch
                enabled={preferences.sms.reminders}
                onToggle={() => togglePreference('sms', 'reminders')}
              />
            </div>

            <div className="h-px bg-white/20" />

            <div className="flex items-center justify-between py-2">
              <div>
                <p className="text-[15px] text-white mb-0.5" style={{ fontWeight: 500 }}>
                  Emergency Alerts
                </p>
                <p className="text-[13px] text-white/60" style={{ fontWeight: 400 }}>
                  Critical notifications only
                </p>
              </div>
              <ToggleSwitch
                enabled={preferences.sms.emergencies}
                onToggle={() => togglePreference('sms', 'emergencies')}
              />
            </div>
          </div>
        </motion.div>

        {/* Save Button */}
        <motion.button
          onClick={handleSave}
          disabled={saving || loading}
          className="w-full rounded-[20px] px-6 py-4 flex items-center justify-center gap-2 border-2 border-white/30 bg-gradient-to-br from-purple-500 to-pink-500 text-white shadow-xl disabled:opacity-60"
          whileTap={{ scale: 0.98 }}
          transition={springConfig}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          {saving ? <Loader2 className="w-5 h-5 animate-spin" strokeWidth={2.5} /> : <Save className="w-5 h-5" strokeWidth={2.5} />}
          <span className="text-[17px]" style={{ fontWeight: 600 }}>
            {saving ? 'Saving...' : 'Save Preferences'}
          </span>
        </motion.button>
      </div>
    </div>
  );
}
