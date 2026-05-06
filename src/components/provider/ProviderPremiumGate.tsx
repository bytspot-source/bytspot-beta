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
}

type CheckoutMessageTone = 'info' | 'error';

export function ProviderPremiumGate({ title, description, features, compact = false, tier = 'vendor-premium' }: ProviderPremiumGateProps) {
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
  const premiumLabel = tier === 'valet-premium' ? 'VALET PREMIUM' : 'VENDOR PREMIUM';
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
      ? `Retry ${tier === 'valet-premium' ? 'Valet' : 'Vendor'} Premium checkout`
      : `Start ${tier === 'valet-premium' ? 'Valet' : 'Vendor'} Premium`;

  return (
    <motion.div
      data-testid={`provider-premium-gate-${tier}`}
      data-state={isUnlocked ? 'unlocked' : 'locked'}
      role="region"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      className={`rounded-[22px] border-2 bg-white text-slate-950 shadow-2xl ${isUnlocked ? 'border-emerald-300 shadow-emerald-950/15' : 'border-amber-300 shadow-amber-950/15'} ${compact ? 'p-4' : 'p-5'}`}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 320, damping: 30, mass: 0.8 }}
    >
      <div className="mb-3 flex items-start gap-3">
        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-[15px] ${isUnlocked ? 'bg-gradient-to-br from-emerald-400 to-cyan-500' : 'bg-gradient-to-br from-amber-400 to-orange-500'}`} aria-hidden="true">
          {isUnlocked ? <CheckCircle2 className="h-5 w-5 text-white" /> : <Crown className="h-5 w-5 text-white" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <p id={titleId} className="text-[16px] font-extrabold text-slate-950">{title}</p>
            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-black ${isUnlocked ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-amber-300 bg-amber-100 text-amber-900'}`}>
              {isUnlocked ? entitlement.label : premiumLabel}
            </span>
          </div>
          <p id={descriptionId} className="text-[13px] font-bold leading-5 text-slate-800">{description}</p>
        </div>
      </div>

      <ul className="grid gap-2" data-testid="provider-premium-feature-list">
        {features.map((feature) => (
          <li key={feature} className="flex items-center gap-2 rounded-[14px] border border-slate-200 bg-slate-50 px-3 py-2 text-[12px] font-extrabold text-slate-950">
            {isUnlocked ? <Zap className="h-4 w-4 text-cyan-700" aria-hidden="true" /> : <Lock className="h-4 w-4 text-amber-700" aria-hidden="true" />}
            {feature}
          </li>
        ))}
      </ul>

      <p className="mt-3 rounded-[14px] border border-violet-200 bg-violet-50 p-3 text-[12px] font-extrabold leading-5 text-violet-950">
        <Sparkles className="mr-1 inline h-3.5 w-3.5 text-fuchsia-700" aria-hidden="true" />
        AI ranking uses internal Optimization Logic. Provider Premium unlocks recommendations, not automatic service decisions.
      </p>

      <div
        id={messageId}
        data-testid="provider-premium-checkout-message"
        role={checkoutMessage?.tone === 'error' ? 'alert' : 'status'}
        aria-live={checkoutMessage?.tone === 'error' ? 'assertive' : 'polite'}
        className={`mt-3 min-h-[1px] rounded-xl px-1 text-[12px] font-extrabold ${checkoutMessage?.tone === 'error' ? 'text-rose-800' : 'text-slate-800'}`}
      >
        {checkoutMessage?.text ?? ''}
      </div>

      {!isUnlocked && (
        <div className="mt-3 grid gap-3">
          <div className="rounded-[16px] border border-slate-200 bg-slate-50 p-3">
            <div className="mb-2 flex items-center justify-between gap-3 text-[12px] text-slate-800">
              <span className="font-bold">Estimated today</span>
              <span className="font-black text-slate-950" data-testid="provider-premium-estimated-price">{formatCents(estimatedCents)} / mo</span>
            </div>
            <label className="mb-2 flex items-center justify-between gap-3 rounded-[12px] border border-slate-300 bg-white px-3 py-2 text-[12px] font-extrabold text-slate-950">
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
                className="w-full rounded-[12px] border border-slate-300 bg-white px-3 py-2 text-[12px] font-bold text-slate-950 placeholder:text-slate-500 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-200"
            />
            {(insiderDiscountCents > 0 || pointsDiscountCents > 0) && (
                <p className="mt-2 text-[11px] font-extrabold text-emerald-800">
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
            className="rounded-[16px] bg-slate-950 px-4 py-3 text-[13px] font-black text-white shadow-lg shadow-slate-950/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 disabled:opacity-60"
          >
            {checkoutCtaLabel}
          </button>
          </div>
        </div>
      )}
    </motion.div>
  );
}