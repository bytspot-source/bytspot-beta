import { useState } from 'react';
import { motion } from 'motion/react';
import { CreditCard, Building2, Calendar, CheckCircle, ExternalLink, RefreshCw } from 'lucide-react';
import { trpc } from '../../../utils/trpc';
import { PROVIDER_PAYOUT_DRAFT_STORAGE_KEY } from '../../../utils/providerStripeConnectReturn';
import type { OnboardingData } from '../ProviderOnboarding';

type PayoutDraft = NonNullable<OnboardingData['payout']>;
type StripeConnectDraft = NonNullable<PayoutDraft['stripeConnect']>;
type ConnectNotice = { tone: 'info' | 'success' | 'error'; message: string };

interface Step8PayoutSetupProps {
  onComplete: (data: Partial<OnboardingData>) => void;
  initialValue?: OnboardingData['payout'];
  businessName?: string;
}

export function Step8PayoutSetup({ onComplete, initialValue, businessName }: Step8PayoutSetupProps) {
  const [accountHolder, setAccountHolder] = useState(initialValue?.bankAccount?.accountHolder || businessName || '');
  const [routingNumber, setRoutingNumber] = useState(initialValue?.bankAccount?.routingNumber || '');
  const [accountNumber, setAccountNumber] = useState(initialValue?.bankAccount?.accountNumber || '');
  const [accountType, setAccountType] = useState<'checking' | 'savings'>(
    initialValue?.bankAccount?.accountType || 'checking'
  );
  const [schedule, setSchedule] = useState<'weekly' | 'monthly'>(
    initialValue?.schedule || 'weekly'
  );
  const [connectLoading, setConnectLoading] = useState(false);
  const [connectStarted, setConnectStarted] = useState(initialValue?.stripeConnect?.onboardingStarted || false);
  const [connectAccountId, setConnectAccountId] = useState(initialValue?.stripeConnect?.accountId || '');
  const [connectStatus, setConnectStatus] = useState<'pending' | 'active'>(initialValue?.stripeConnect?.status || 'pending');
  const [connectUrl, setConnectUrl] = useState('');
  const [connectNotice, setConnectNotice] = useState<ConnectNotice | null>(() => (
    initialValue?.stripeConnect?.status === 'active'
      ? { tone: 'success', message: 'Stripe verified your payout account. You can continue to review.' }
      : initialValue?.stripeConnect?.onboardingStarted
        ? { tone: 'info', message: 'Stripe verification has started. Refresh the link if Stripe asked you to provide more details.' }
        : null
  ));

  const springConfig = {
    type: "spring" as const,
    stiffness: 320,
    damping: 30,
    mass: 0.8,
  };

  const buildPayoutDraft = (stripeConnect: Partial<StripeConnectDraft> = {}): PayoutDraft => ({
    bankAccount: {
      accountHolder,
      routingNumber,
      accountNumber,
      accountType,
    },
    schedule,
    stripeConnect: {
      displayName: businessName || accountHolder || 'Bytspot Provider',
      onboardingStarted: connectStarted,
      accountId: connectAccountId || undefined,
      status: connectStatus,
      ...stripeConnect,
    },
  });

  const persistPayoutDraft = (payout: PayoutDraft) => {
    try {
      localStorage.setItem(PROVIDER_PAYOUT_DRAFT_STORAGE_KEY, JSON.stringify(payout));
    } catch {
      // Local storage can be unavailable in private modes; Stripe return sync still works from backend state.
    }
  };

  const isValid = () => {
    return (
      accountHolder.trim() !== '' &&
      routingNumber.length === 9 &&
      accountNumber.length >= 4 &&
      connectStarted
    );
  };

  const statusLabel = connectLoading
    ? 'Preparing link'
    : connectStatus === 'active'
      ? 'Active'
      : connectStarted
        ? 'Verification pending'
        : 'Not started';

  const statusDescription = connectLoading
    ? 'Preparing a secure Stripe Express onboarding link…'
    : connectStatus === 'active'
      ? 'Stripe payouts are active for this Provider account.'
      : connectStarted
        ? 'Stripe verification has started. If Stripe needs more information, refresh the link and complete the remaining steps.'
        : 'Generate a secure Stripe Express link before final submission.';

  const statusBadgeClass = connectStatus === 'active'
    ? 'border-emerald-300/40 bg-emerald-400/15 text-emerald-100'
    : connectStarted || connectLoading
      ? 'border-amber-300/40 bg-amber-400/15 text-amber-100'
      : 'border-white/15 bg-white/10 text-white/75';

  const noticeClass = connectNotice?.tone === 'success'
    ? 'border-emerald-300/30 bg-emerald-400/15 text-emerald-50'
    : connectNotice?.tone === 'error'
      ? 'border-red-300/30 bg-red-500/15 text-red-50'
      : 'border-cyan-300/25 bg-cyan-400/15 text-cyan-50';

  const startStripeConnect = async () => {
    const authToken = localStorage.getItem('bytspot_auth_token');
      if (!authToken || authToken === 'guest_session') {
      setConnectNotice({ tone: 'error', message: 'Please complete account setup or sign in before starting Stripe Connect payouts.' });
      return;
    }

    setConnectLoading(true);
    setConnectNotice({ tone: 'info', message: 'Preparing your secure Stripe Express verification link…' });
    persistPayoutDraft(buildPayoutDraft({ onboardingStarted: connectStarted, status: connectStatus }));

    try {
      const result = await trpc.vendors.startOnboarding.mutate({
        displayName: businessName || accountHolder || 'Bytspot Provider',
        refreshPath: '/provider/connect/refresh',
        returnPath: '/provider/connect/return',
      });
      const onboardingUrl = typeof result?.url === 'string' ? result.url.trim() : '';
      if (!onboardingUrl) {
        setConnectNotice({ tone: 'error', message: result?.message || 'Stripe onboarding is not available yet. Please try again from the Provider dashboard.' });
        return;
      }
      const nextAccountId = result?.vendor?.stripeAccountId || initialValue?.stripeConnect?.accountId || connectAccountId;
      const nextStatus = result?.vendor?.onboardingStatus === 'active' ? 'active' : 'pending';

      setConnectStarted(true);
      setConnectAccountId(nextAccountId);
      setConnectStatus(nextStatus);
      setConnectUrl(onboardingUrl);
      setConnectNotice({ tone: 'success', message: 'Stripe link ready. Redirecting to Stripe Express verification…' });
      localStorage.setItem('bytspot_provider_stripe_connect_started', 'true');
      persistPayoutDraft(buildPayoutDraft({
        onboardingStarted: true,
        accountId: nextAccountId || undefined,
        status: nextStatus,
      }));
      window.location.href = onboardingUrl;
    } catch (err: any) {
      setConnectNotice({ tone: 'error', message: err?.message || 'Unable to start Stripe Connect. Please try again.' });
    } finally {
      setConnectLoading(false);
    }
  };

  const handleContinue = () => {
    if (isValid()) {
      onComplete({
        payout: {
          bankAccount: {
            accountHolder,
            routingNumber,
            accountNumber,
            accountType,
          },
          schedule,
          stripeConnect: {
            displayName: businessName || accountHolder || 'Bytspot Provider',
            onboardingStarted: connectStarted,
            accountId: connectAccountId || undefined,
            status: connectStatus,
          },
        },
      });
    }
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
          Payout Setup
        </h1>
        <p className="text-[17px] text-white/70" style={{ fontWeight: 400 }}>
          Where should we send your earnings?
        </p>
      </motion.div>

      <div className="space-y-5">
        {/* Stripe Connect */}
        <motion.div
          className="rounded-[22px] border-2 border-cyan-400/40 bg-cyan-400/10 p-5 backdrop-blur-xl"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...springConfig, delay: 0.08 }}
        >
          <div className="mb-4 flex items-start gap-3">
            <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-[16px] bg-white text-black">
              {connectStarted ? <CheckCircle className="h-5 w-5 text-emerald-600" strokeWidth={2.5} /> : <CreditCard className="h-5 w-5" strokeWidth={2.5} />}
            </div>
            <div>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <p className="text-[15px] text-white" style={{ fontWeight: 700 }}>Stripe Connect payouts</p>
                <span data-testid="provider-stripe-connect-status-badge" className={`rounded-full border px-2.5 py-1 text-[11px] uppercase tracking-[0.14em] ${statusBadgeClass}`} style={{ fontWeight: 800 }}>
                  {statusLabel}
                </span>
              </div>
              <p data-testid="provider-stripe-connect-status" className="mt-1 text-[13px] leading-5 text-white/75" style={{ fontWeight: 400 }}>
                {statusDescription}
              </p>
            </div>
          </div>

          <button
            type="button"
            data-testid="provider-stripe-connect-cta"
            onClick={startStripeConnect}
            disabled={connectLoading}
            className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-white px-4 py-3 text-[15px] text-black shadow-lg disabled:opacity-60"
            style={{ fontWeight: 800 }}
          >
            {connectLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
            {connectLoading ? 'Preparing secure Stripe link…' : connectStarted ? 'Refresh Stripe Connect Link' : 'Start Stripe Connect'}
          </button>

          {connectNotice && (
            <p data-testid="provider-stripe-connect-notice" role={connectNotice.tone === 'error' ? 'alert' : 'status'} aria-live="polite" className={`mt-3 rounded-[16px] border px-3 py-2 text-[13px] leading-5 ${noticeClass}`}>
              {connectNotice.message}
            </p>
          )}
          {connectUrl && (
            <a data-testid="provider-stripe-connect-link" href={connectUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex text-[13px] text-cyan-200 underline">
              Open Stripe Express verification
            </a>
          )}
        </motion.div>

        {/* Account Holder Name */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...springConfig, delay: 0.1 }}
        >
          <label className="block text-[15px] text-white mb-2" style={{ fontWeight: 600 }}>
            Account Holder Name
          </label>
          <div className="relative">
            <div className="absolute left-4 top-1/2 -translate-y-1/2">
              <Building2 className="w-5 h-5 text-white/60" strokeWidth={2.5} />
            </div>
            <input
              data-testid="provider-payout-account-holder"
              type="text"
              value={accountHolder}
              onChange={(e) => setAccountHolder(e.target.value)}
              placeholder="Full legal name on account"
              className="w-full pl-12 pr-4 py-3.5 rounded-[16px] border-2 border-white/30 bg-[#1C1C1E]/80 backdrop-blur-xl text-white placeholder:text-white/50 outline-none focus:border-purple-500/50 transition-colors"
              style={{ fontSize: '17px', fontWeight: 400 }}
            />
          </div>
        </motion.div>

        {/* Routing Number */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...springConfig, delay: 0.15 }}
        >
          <label className="block text-[15px] text-white mb-2" style={{ fontWeight: 600 }}>
            Routing Number
          </label>
          <input
            data-testid="provider-payout-routing"
            type="text"
            value={routingNumber}
            onChange={(e) => {
              const value = e.target.value.replace(/\D/g, '').slice(0, 9);
              setRoutingNumber(value);
            }}
            placeholder="9-digit routing number"
            maxLength={9}
            className="w-full px-4 py-3.5 rounded-[16px] border-2 border-white/30 bg-[#1C1C1E]/80 backdrop-blur-xl text-white placeholder:text-white/50 outline-none focus:border-purple-500/50 transition-colors"
            style={{ fontSize: '17px', fontWeight: 400 }}
          />
          {routingNumber.length > 0 && routingNumber.length < 9 && (
            <p className="text-[13px] text-orange-400 mt-2" style={{ fontWeight: 400 }}>
              Routing number must be 9 digits
            </p>
          )}
        </motion.div>

        {/* Account Number */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...springConfig, delay: 0.2 }}
        >
          <label className="block text-[15px] text-white mb-2" style={{ fontWeight: 600 }}>
            Account Number
          </label>
          <div className="relative">
            <div className="absolute left-4 top-1/2 -translate-y-1/2">
              <CreditCard className="w-5 h-5 text-white/60" strokeWidth={2.5} />
            </div>
            <input
              data-testid="provider-payout-account-number"
              type="text"
              value={accountNumber}
              onChange={(e) => {
                const value = e.target.value.replace(/\D/g, '');
                setAccountNumber(value);
              }}
              placeholder="Account number"
              className="w-full pl-12 pr-4 py-3.5 rounded-[16px] border-2 border-white/30 bg-[#1C1C1E]/80 backdrop-blur-xl text-white placeholder:text-white/50 outline-none focus:border-purple-500/50 transition-colors"
              style={{ fontSize: '17px', fontWeight: 400 }}
            />
          </div>
        </motion.div>

        {/* Account Type */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...springConfig, delay: 0.25 }}
        >
          <label className="block text-[15px] text-white mb-3" style={{ fontWeight: 600 }}>
            Account Type
          </label>
          <div className="grid grid-cols-2 gap-3">
            {[
              { id: 'checking' as const, label: 'Checking' },
              { id: 'savings' as const, label: 'Savings' },
            ].map((type) => (
              <button
                key={type.id}
                data-testid={`provider-payout-account-type-${type.id}`}
                onClick={() => setAccountType(type.id)}
                className={`p-4 rounded-[16px] border-2 transition-all ${
                  accountType === type.id
                    ? 'border-purple-500/50 bg-purple-500/20'
                    : 'border-white/30 bg-[#1C1C1E]/80'
                } backdrop-blur-xl`}
              >
                <div className="text-[15px] text-white" style={{ fontWeight: 600 }}>
                  {type.label}
                </div>
              </button>
            ))}
          </div>
        </motion.div>

        {/* Payout Schedule */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...springConfig, delay: 0.3 }}
        >
          <label className="block text-[15px] text-white mb-3" style={{ fontWeight: 600 }}>
            Payout Schedule
          </label>
          <div className="space-y-3">
            {[
              { id: 'weekly' as const, label: 'Weekly', description: 'Get paid every Friday' },
              { id: 'monthly' as const, label: 'Monthly', description: 'Get paid on the 1st of each month' },
            ].map((sched) => (
              <button
                key={sched.id}
                data-testid={`provider-payout-schedule-${sched.id}`}
                onClick={() => setSchedule(sched.id)}
                className={`w-full flex items-center justify-between p-4 rounded-[16px] border-2 transition-all ${
                  schedule === sched.id
                    ? 'border-purple-500/50 bg-purple-500/20'
                    : 'border-white/30 bg-[#1C1C1E]/80'
                } backdrop-blur-xl`}
              >
                <div className="flex items-center gap-3">
                  <Calendar className="w-5 h-5 text-white" strokeWidth={2.5} />
                  <div className="text-left">
                    <div className="text-[15px] text-white" style={{ fontWeight: 600 }}>
                      {sched.label}
                    </div>
                    <div className="text-[13px] text-white/70" style={{ fontWeight: 400 }}>
                      {sched.description}
                    </div>
                  </div>
                </div>
                <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                  schedule === sched.id
                    ? 'border-white bg-gradient-to-br from-purple-500 to-cyan-500'
                    : 'border-white/50'
                }`}>
                  {schedule === sched.id && (
                    <svg width="12" height="10" viewBox="0 0 12 10" fill="none">
                      <path
                        d="M1 5L4.5 8.5L11 1.5"
                        stroke="white"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                </div>
              </button>
            ))}
          </div>
        </motion.div>

        {/* Security Notice */}
        <motion.div
          className="rounded-[20px] p-6 border-2 border-green-500/50 bg-green-500/20 backdrop-blur-xl"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...springConfig, delay: 0.35 }}
        >
          <div className="flex items-start gap-4">
            <CreditCard className="w-6 h-6 text-green-400 flex-shrink-0 mt-1" strokeWidth={2.5} />
            <div>
              <h3 className="text-[15px] text-white mb-2" style={{ fontWeight: 600 }}>
                Powered by Stripe
              </h3>
              <p className="text-[13px] text-white/80" style={{ fontWeight: 400 }}>
                Your banking information is securely stored and encrypted. We never see or store your full account details.
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
          data-testid="provider-onboarding-continue"
          onClick={handleContinue}
          disabled={!isValid()}
          className={`w-full py-4 rounded-full shadow-xl transition-all ${
            isValid()
              ? 'bg-gradient-to-r from-purple-500 to-cyan-500 text-white cursor-pointer'
              : 'bg-white/20 text-white/50 cursor-not-allowed'
          }`}
          whileTap={isValid() ? { scale: 0.98 } : {}}
          whileHover={isValid() ? { scale: 1.02 } : {}}
        >
          <span className="text-[17px]" style={{ fontWeight: 600 }}>
            Continue
          </span>
        </motion.button>
      </motion.div>
    </div>
  );
}
