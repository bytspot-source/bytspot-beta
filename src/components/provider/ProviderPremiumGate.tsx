import { useEffect, useId, useState } from 'react';
import { motion } from 'motion/react';
import { CheckCircle2, Crown, Lock, Sparkles, Zap } from 'lucide-react';
import { trpc } from '../../utils/trpc';
import {
  getProviderPremiumEntitlement,
  PROVIDER_PREMIUM_EVENT,
  syncProviderPremiumEntitlementFromSubscription,
  type ProviderPremiumEntitlement,
  type ProviderPremiumTier,
} from '../../utils/providerPremium';

interface ProviderPremiumGateProps {
  title: string;
  description: string;
  features: string[];
  compact?: boolean;
  tier?: Exclude<ProviderPremiumTier, 'free'>;
  isDarkMode?: boolean;
}

type CheckoutMessageTone = 'info' | 'error';

export function ProviderPremiumGate({ title, description, features, compact = false, tier = 'vendor-premium', isDarkMode = false }: ProviderPremiumGateProps) {
  const [entitlement, setEntitlement] = useState<ProviderPremiumEntitlement>(() => getProviderPremiumEntitlement());
  const [subscriptionStatus, setSubscriptionStatus] = useState<any>(null);
  const [usePoints, setUsePoints] = useState(false);
  const [couponCode, setCouponCode] = useState('');
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutMessage, setCheckoutMessage] = useState<{ tone: CheckoutMessageTone; text: string } | null>(null);
  const [checkoutAttempts, setCheckoutAttempts] = useState(0);
  const messageId = useId();
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const refresh = () => setEntitlement(getProviderPremiumEntitlement());
    trpc.subscription.status.query()
      .then((status: any) => {
        setSubscriptionStatus(status);
        setEntitlement(syncProviderPremiumEntitlementFromSubscription(status, tier));
      })
      .catch(() => refresh());
    window.addEventListener(PROVIDER_PREMIUM_EVENT, refresh);
    return () => window.removeEventListener(PROVIDER_PREMIUM_EVENT, refresh);
  }, [tier]);

  const isUnlocked = entitlement.isActive && entitlement.tier === tier;
  const premiumLabel = tier === 'valet-premium' ? 'VALET PREMIUM' : 'PROVIDER PREMIUM';
  const offer = subscriptionStatus?.subscriptionOffers?.[tier];
  const availablePoints = Number(subscriptionStatus?.availablePoints ?? subscriptionStatus?.loyalty?.availablePoints ?? 0);
  const baseCents = Number(offer?.baseUnitAmountCents ?? (tier === 'valet-premium' ? 1499 : 4900));
  const insiderDiscountCents = Number(offer?.upgradeDiscountCents ?? 0);
  const maxPointsDiscountCents = Number(offer?.maxPointsDiscountCents ?? 0);
  const pointsDiscountCents = usePoints ? maxPointsDiscountCents : 0;
  const estimatedCents = Math.max(50, baseCents - insiderDiscountCents - pointsDiscountCents);
  const formatCents = (cents: number) => `$${(cents / 100).toFixed(2)}`;

  const startCheckout = async () => {
    setCheckoutLoading(true);
    setCheckoutMessage(null);
    setCheckoutAttempts((count) => count + 1);

    try {
      const result = await trpc.subscription.createCheckout.mutate({
        plan: tier,
        usePoints,
        couponCode: couponCode.trim() || undefined,
      });
      if (result?.url) {
        window.location.href = result.url;
        return;
      }
      if (result?.message === 'Already premium') {
        const status = await trpc.subscription.status.query();
        setEntitlement(syncProviderPremiumEntitlementFromSubscription(status, tier));
        setCheckoutMessage({ tone: 'info', text: 'Premium is already active for this account.' });
        return;
      }
      setCheckoutMessage({ tone: 'error', text: result?.message ?? 'Checkout is not available yet.' });
    } catch {
      setCheckoutMessage({ tone: 'error', text: 'Checkout unavailable. Please retry after billing is configured.' });
    } finally {
      setCheckoutLoading(false);
    }
  };

  const pointsCheckboxDisabled = availablePoints <= 0 || maxPointsDiscountCents <= 0;
  const checkoutCtaLabel = checkoutLoading
    ? 'Opening Checkout…'
    : checkoutAttempts > 0 && checkoutMessage?.tone === 'error'
      ? `Retry ${tier === 'valet-premium' ? 'Valet' : 'Provider'} Premium checkout`
      : `Start ${tier === 'valet-premium' ? 'Valet' : 'Provider'} Premium`;
  const shellClass = isDarkMode
    ? `bg-[#020617] text-white shadow-black/45 ${isUnlocked ? 'border-emerald-400' : 'border-amber-400'}`
    : `bg-white text-slate-950 shadow-slate-200/80 ${isUnlocked ? 'border-emerald-300' : 'border-amber-300'}`;
  const titleClass = isDarkMode ? 'text-white' : 'text-slate-950';
  const bodyClass = isDarkMode ? 'text-slate-100' : 'text-slate-800';
  const featureClass = isDarkMode
    ? 'border-slate-700 bg-[#0F172A] text-slate-100'
    : 'border-slate-200 bg-slate-50 text-slate-950';
  const noteClass = isDarkMode
    ? 'border-violet-500 bg-violet-950 text-violet-50'
    : 'border-violet-200 bg-violet-50 text-violet-950';
  const messageClass = checkoutMessage?.tone === 'error'
    ? isDarkMode ? 'text-rose-200' : 'text-rose-800'
    : isDarkMode ? 'text-slate-200' : 'text-slate-800';
  const pricingClass = isDarkMode ? 'border-slate-700 bg-[#0F172A]' : 'border-slate-200 bg-slate-50';
  const optionClass = isDarkMode
    ? 'border-slate-600 bg-[#020617] text-white'
    : 'border-slate-300 bg-white text-slate-950';
  const inputClass = isDarkMode
    ? 'border-slate-600 bg-[#020617] text-white placeholder:text-slate-400 focus:border-cyan-400 focus:ring-cyan-500/40'
    : 'border-slate-300 bg-white text-slate-950 placeholder:text-slate-500 focus:border-cyan-500 focus:ring-cyan-200';
  const savingsClass = isDarkMode ? 'text-emerald-200' : 'text-emerald-800';
  const checkoutClass = isDarkMode
    ? 'bg-cyan-300 text-slate-950 shadow-cyan-950/30 hover:bg-cyan-200 focus-visible:ring-cyan-300'
    : 'bg-slate-950 text-white shadow-slate-950/20 hover:bg-slate-800 focus-visible:ring-cyan-500';
  const featureIconClass = isUnlocked
    ? isDarkMode ? 'text-cyan-300' : 'text-cyan-700'
    : isDarkMode ? 'text-amber-300' : 'text-amber-700';
  const sparkleClass = isDarkMode ? 'text-fuchsia-300' : 'text-fuchsia-700';

  return (
    <motion.div
      data-testid={`provider-premium-gate-${tier}`}
      data-state={isUnlocked ? 'unlocked' : 'locked'}
      role="region"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      className={`relative overflow-hidden rounded-[22px] border-2 shadow-2xl ${shellClass} ${compact ? 'p-4' : 'p-5'}`}
      style={{ backgroundColor: isDarkMode ? '#020617' : '#ffffff' }}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 320, damping: 30, mass: 0.8 }}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-cyan-400 via-violet-500 to-fuchsia-500" />
      <div className="mb-3 flex items-start gap-3">
        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-[15px] ${isUnlocked ? 'bg-gradient-to-br from-emerald-400 to-cyan-500' : 'bg-gradient-to-br from-amber-400 to-orange-500'}`} aria-hidden="true">
          {isUnlocked ? <CheckCircle2 className="h-5 w-5 text-white" /> : <Crown className="h-5 w-5 text-white" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <p id={titleId} className={`text-[16px] font-extrabold ${titleClass}`}>{title}</p>
            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-black ${isUnlocked ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-amber-300 bg-amber-100 text-amber-900'}`}>
              {isUnlocked ? entitlement.label : premiumLabel}
            </span>
          </div>
          <p id={descriptionId} className={`text-[13px] font-bold leading-5 ${bodyClass}`}>{description}</p>
        </div>
      </div>

      <ul className="grid gap-2" data-testid="provider-premium-feature-list">
        {features.map((feature) => (
          <li key={feature} className={`flex items-center gap-2 rounded-[14px] border px-3 py-2 text-[12px] font-extrabold ${featureClass}`} style={{ backgroundColor: isDarkMode ? '#0f172a' : '#f8fafc' }}>
            {isUnlocked ? <Zap className={`h-4 w-4 ${featureIconClass}`} aria-hidden="true" /> : <Lock className={`h-4 w-4 ${featureIconClass}`} aria-hidden="true" />}
            {feature}
          </li>
        ))}
      </ul>

      <p className={`mt-3 rounded-[14px] border p-3 text-[12px] font-extrabold leading-5 ${noteClass}`} style={{ backgroundColor: isDarkMode ? '#2e1065' : '#faf5ff' }}>
        <Sparkles className={`mr-1 inline h-3.5 w-3.5 ${sparkleClass}`} aria-hidden="true" />
        AI ranking uses internal Optimization Logic. Provider Premium unlocks recommendations, not automatic service decisions.
      </p>

      <div
        id={messageId}
        data-testid="provider-premium-checkout-message"
        role={checkoutMessage?.tone === 'error' ? 'alert' : 'status'}
        aria-live={checkoutMessage?.tone === 'error' ? 'assertive' : 'polite'}
        className={`mt-3 min-h-[1px] rounded-xl px-1 text-[12px] font-extrabold ${messageClass}`}
      >
        {checkoutMessage?.text ?? ''}
      </div>

      {!isUnlocked && (
        <div className="mt-3 grid gap-3">
          <div className={`rounded-[16px] border p-3 ${pricingClass}`} style={{ backgroundColor: isDarkMode ? '#0f172a' : '#f8fafc' }}>
            <div className={`mb-2 flex items-center justify-between gap-3 text-[12px] ${bodyClass}`}>
              <span className="font-bold">Estimated today</span>
              <span className={`font-black ${titleClass}`} data-testid="provider-premium-estimated-price">{formatCents(estimatedCents)} / mo</span>
            </div>
            <label className={`mb-2 flex items-center justify-between gap-3 rounded-[12px] border px-3 py-2 text-[12px] font-extrabold ${optionClass}`} style={{ backgroundColor: isDarkMode ? '#020617' : '#ffffff' }}>
              <span>Use {availablePoints.toLocaleString()} points</span>
              <input
                type="checkbox"
                data-testid="provider-premium-use-points"
                checked={usePoints}
                disabled={pointsCheckboxDisabled}
                aria-disabled={pointsCheckboxDisabled || undefined}
                aria-describedby={pointsCheckboxDisabled ? `${messageId}-points-hint` : undefined}
                onChange={(event) => setUsePoints(event.target.checked)}
                className="h-4 w-4 accent-cyan-400"
              />
            </label>
            {pointsCheckboxDisabled && (
              <p id={`${messageId}-points-hint`} className="sr-only">
                Loyalty points discount is not available for this account yet.
              </p>
            )}
            <input
              value={couponCode}
              onChange={(event) => setCouponCode(event.target.value)}
              placeholder="Coupon code"
              data-testid="provider-premium-coupon"
              aria-label="Coupon code"
              className={`w-full rounded-[12px] border px-3 py-2 text-[12px] font-bold outline-none focus:ring-2 ${inputClass}`}
              style={{ backgroundColor: isDarkMode ? '#020617' : '#ffffff' }}
            />
            {(insiderDiscountCents > 0 || pointsDiscountCents > 0) && (
              <p className={`mt-2 text-[11px] font-extrabold ${savingsClass}`}>
                Saves {formatCents(insiderDiscountCents + pointsDiscountCents)} before any Stripe coupon is applied.
              </p>
            )}
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              data-testid="provider-premium-checkout-cta"
              onClick={startCheckout}
              disabled={checkoutLoading}
              aria-busy={checkoutLoading || undefined}
              aria-describedby={messageId}
              className={`rounded-[16px] px-4 py-3 text-[13px] font-black shadow-lg focus-visible:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-60 ${checkoutClass}`}
            >
              {checkoutCtaLabel}
            </button>
          </div>
        </div>
      )}
    </motion.div>
  );
}