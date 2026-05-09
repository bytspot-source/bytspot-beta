import { motion } from 'motion/react';
import { ArrowLeft, Plus, CreditCard, Trash2, Check, Shield, Loader2, ExternalLink } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner@2.0.3';
import { trpc } from '../utils/trpc';

interface PaymentMethodsProps {
  isDarkMode: boolean;
  onBack: () => void;
  onPaymentMethodsChanged?: (count: number) => void;
}

interface PaymentMethod {
  id: string;
  type: 'card' | 'apple_pay' | 'google_pay' | 'paypal';
  last4?: string;
  brand?: string;
  expiryMonth?: string;
  expiryYear?: string;
  isDefault: boolean;
}

export function PaymentMethods({ isDarkMode, onBack, onPaymentMethodsChanged }: PaymentMethodsProps) {
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isStartingSetup, setIsStartingSetup] = useState(false);
  const [showAddCard, setShowAddCard] = useState(false);
  const [setupMessage, setSetupMessage] = useState<string | null>(null);
  const [setupError, setSetupError] = useState<string | null>(null);

  const loadMethods = async () => {
    setIsLoading(true);
    try {
      const result = await trpc.payments.listMethods.query();
      const nextMethods = (result ?? []) as PaymentMethod[];
      setMethods(nextMethods);
      onPaymentMethodsChanged?.(nextMethods.length);
    } catch (err: any) {
      toast.error('Unable to load payment methods', { description: err?.message ?? 'Please try again.' });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadMethods();
  }, []);

  const springConfig = {
    type: "spring" as const,
    stiffness: 320,
    damping: 30,
    mass: 0.8,
  };

  const surfaceClass = isDarkMode
    ? 'border-slate-700 bg-slate-950 text-white shadow-[0_18px_46px_rgba(0,0,0,0.36)]'
    : 'border-slate-200 bg-white text-slate-950 shadow-[0_18px_44px_rgba(15,23,42,0.12)]';
  const mutedTextClass = isDarkMode ? 'text-slate-300' : 'text-slate-600';
  const subtleTextClass = isDarkMode ? 'text-slate-400' : 'text-slate-500';
  const iconButtonClass = isDarkMode
    ? 'bg-slate-900 border-slate-700 text-white shadow-xl'
    : 'bg-white border-slate-200 text-slate-950 shadow-lg';

  const getMethodIcon = (type: PaymentMethod['type']) => {
    switch (type) {
      case 'card':
        return <CreditCard className="w-5 h-5" strokeWidth={2.5} />;
      case 'apple_pay':
      case 'google_pay':
        return <CreditCard className="w-5 h-5" strokeWidth={2.5} />;
      default:
        return <CreditCard className="w-5 h-5" strokeWidth={2.5} />;
    }
  };

  const getMethodLabel = (method: PaymentMethod) => {
    switch (method.type) {
      case 'card':
        return `${method.brand} •••• ${method.last4}`;
      case 'apple_pay':
        return 'Apple Pay';
      case 'google_pay':
        return 'Google Pay';
      case 'paypal':
        return 'PayPal';
      default:
        return 'Payment Method';
    }
  };

  const getMethodColor = (type: PaymentMethod['type']) => {
    switch (type) {
      case 'card':
        return 'from-slate-900 to-cyan-800 border-cyan-300 text-white';
      case 'apple_pay':
        return 'from-slate-900 to-slate-700 border-slate-300 text-white';
      case 'google_pay':
        return 'from-emerald-700 to-cyan-700 border-emerald-300 text-white';
      case 'paypal':
        return 'from-blue-700 to-blue-950 border-blue-300 text-white';
      default:
        return 'from-slate-800 to-fuchsia-800 border-fuchsia-300 text-white';
    }
  };

  const handleSetDefault = async (id: string) => {
    try {
      await trpc.payments.setDefaultMethod.mutate({ paymentMethodId: id });
      setMethods(current => current.map(m => ({ ...m, isDefault: m.id === id })));
      toast.success('Default payment method updated');
    } catch (err: any) {
      toast.error('Unable to update default', { description: err?.message ?? 'Please try again.' });
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await trpc.payments.removeMethod.mutate({ paymentMethodId: id });
      setMethods(current => {
        const nextMethods = current.filter(m => m.id !== id);
        onPaymentMethodsChanged?.(nextMethods.length);
        return nextMethods;
      });
      toast.success('Payment method removed');
    } catch (err: any) {
      toast.error('Unable to remove payment method', { description: err?.message ?? 'Please try again.' });
    }
  };

  const handleAddCard = async () => {
    if (isStartingSetup) return;
    const token = localStorage.getItem('bytspot_auth_token');
    if (!token || token === 'guest_session') {
      const message = 'Sign in before saving a payment method.';
      setSetupError(message);
      toast.info('Sign in required', { description: message });
      return;
    }

    setIsStartingSetup(true);
    setSetupError(null);
    setSetupMessage('Creating a secure Stripe setup session…');
    try {
      const result = await trpc.payments.setupSession.mutate({
        successPath: '/profile/payment',
        cancelPath: '/profile/payment',
      });
      if (result?.url) {
        setSetupMessage('Stripe is ready. Redirecting now…');
        localStorage.setItem('bytspot_profile_focus', 'payment');
        window.location.assign(result.url);
        return;
      }
      const message = 'Stripe did not return a secure setup link.';
      setSetupError(message);
      setSetupMessage(null);
      toast.error('Unable to start secure card setup', { description: message });
    } catch (err: any) {
      const message = err?.message ?? 'Please try again.';
      setSetupError(message);
      setSetupMessage(null);
      toast.error('Unable to start secure card setup', { description: message });
    } finally {
      setIsStartingSetup(false);
    }
  };

  if (showAddCard) {
    return (
      <div className="h-full overflow-y-auto bg-black pb-24 text-white">
        {/* Header */}
        <motion.div
          className="sticky top-0 z-10 flex items-center gap-3 bg-black px-4 pb-4 pt-4"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={springConfig}
        >
          <motion.button
            onClick={() => setShowAddCard(false)}
            className={`tap-target flex h-10 w-10 items-center justify-center rounded-full border-2 ${iconButtonClass}`}
            whileTap={{ scale: 0.9 }}
            transition={springConfig}
          >
            <ArrowLeft className="w-5 h-5 text-white" strokeWidth={2.5} />
          </motion.button>
          <h1 className="text-title-2 text-white" style={{ fontWeight: 850 }}>
            Add Card
          </h1>
        </motion.div>

        <div className="px-4 space-y-6">
          {/* Security Notice */}
          <motion.div
            className="rounded-[24px] border-2 border-emerald-500/45 bg-emerald-950 p-4 shadow-[0_16px_40px_rgba(0,0,0,0.28)]"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...springConfig, delay: 0.1 }}
          >
            <div className="flex items-start gap-3">
              <Shield className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" strokeWidth={2.5} />
              <div>
                <h3 className="mb-1 text-[15px] text-white" style={{ fontWeight: 850 }}>
                  PCI-DSS Compliant
                </h3>
                <p className="text-[13px] leading-5 text-emerald-50" style={{ fontWeight: 650 }}>
                  Your payment information is encrypted and securely stored. We never see or store your CVV.
                </p>
              </div>
            </div>
          </motion.div>

          {/* Hosted Stripe Card Setup */}
          <motion.div
            className="rounded-[28px] border-2 border-slate-700 bg-slate-950 p-6 shadow-[0_20px_54px_rgba(0,0,0,0.38)]"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...springConfig, delay: 0.15 }}
          >
            <h3 className="mb-3 text-[18px] text-white" style={{ fontWeight: 900 }}>
              Secure Stripe setup
            </h3>
            <p className="text-[14px] leading-6 text-slate-200" style={{ fontWeight: 650 }}>
              You will be redirected to Stripe Checkout to add a card. Bytspot never receives or stores raw card numbers, expiry dates, or CVV values.
            </p>
            <div className="mt-5 rounded-[18px] border border-cyan-300/30 bg-cyan-950/70 p-3">
              <p className="text-[12px] uppercase tracking-[0.16em] text-cyan-200" style={{ fontWeight: 900 }}>Secure save flow</p>
              <p className="mt-1 text-[13px] leading-5 text-cyan-50" style={{ fontWeight: 650 }}>
                Bytspot starts a PCI-safe Stripe setup session, then Stripe attaches the new card to your customer profile.
              </p>
            </div>
            {(setupMessage || setupError) && (
              <div className={`mt-4 rounded-[16px] border px-3 py-2 ${setupError ? 'border-red-300/45 bg-red-950 text-red-100' : 'border-emerald-300/45 bg-emerald-950 text-emerald-50'}`}>
                <p className="text-[13px]" style={{ fontWeight: 750 }}>{setupError ?? setupMessage}</p>
              </div>
            )}
          </motion.div>

          {/* Add Button */}
          <motion.button
            onClick={handleAddCard}
            disabled={isStartingSetup}
            aria-busy={isStartingSetup}
            data-testid="payment-method-start-stripe-setup"
            className="flex w-full items-center justify-center gap-2 rounded-[22px] border-2 border-white/30 bg-gradient-to-br from-cyan-500 via-purple-500 to-pink-500 px-6 py-4 text-white shadow-xl transition disabled:cursor-wait disabled:opacity-75"
            whileTap={{ scale: 0.98 }}
            transition={springConfig}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
          >
            {isStartingSetup ? <Loader2 className="w-5 h-5 animate-spin" strokeWidth={2.5} /> : <ExternalLink className="w-5 h-5" strokeWidth={2.5} />}
            <span className="text-[17px]" style={{ fontWeight: 600 }}>
              {isStartingSetup ? 'Preparing Stripe...' : 'Continue to Stripe'}
            </span>
          </motion.button>
        </div>
      </div>
    );
  }

  return (
    <div className={`h-full overflow-y-auto pb-24 ${isDarkMode ? 'bg-black text-white' : 'bg-slate-50 text-slate-950'}`}>
      {/* Header */}
      <motion.div
        className={`sticky top-0 z-10 flex items-center justify-between px-4 pb-4 pt-4 ${isDarkMode ? 'bg-black' : 'bg-slate-50'}`}
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={springConfig}
      >
        <div className="flex items-center gap-3">
          <motion.button
            onClick={onBack}
            className={`tap-target flex h-10 w-10 items-center justify-center rounded-full border-2 ${iconButtonClass}`}
            whileTap={{ scale: 0.9 }}
            transition={springConfig}
          >
            <ArrowLeft className={`h-5 w-5 ${isDarkMode ? 'text-white' : 'text-slate-950'}`} strokeWidth={2.5} />
          </motion.button>
          <h1 className={isDarkMode ? 'text-title-2 text-white' : 'text-title-2 text-slate-950'}>
            Payment Methods
          </h1>
        </div>

        <motion.button
          onClick={() => setShowAddCard(true)}
          className="tap-target flex h-10 w-10 items-center justify-center rounded-full border-2 border-white/30 bg-gradient-to-br from-cyan-500 via-purple-500 to-pink-500 shadow-xl"
          whileTap={{ scale: 0.9 }}
          transition={springConfig}
        >
          <Plus className="w-5 h-5 text-white" strokeWidth={2.5} />
        </motion.button>
      </motion.div>

      <div className="px-4 space-y-4">
        {/* Security Notice */}
        <motion.div
          className={`rounded-[22px] border-2 p-4 ${surfaceClass}`}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={springConfig}
        >
          <div className="flex items-start gap-3">
            <Shield className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" strokeWidth={2.5} />
            <div>
              <p className={`text-[13px] ${mutedTextClass}`} style={{ fontWeight: 650 }}>
                All payment methods are encrypted and PCI-DSS compliant
              </p>
            </div>
          </div>
        </motion.div>

        {isLoading && (
          <div className={`rounded-[22px] border-2 p-8 text-center ${surfaceClass}`}>
            <Loader2 className="w-8 h-8 text-purple-300 animate-spin mx-auto mb-3" />
            <p className={`text-[15px] ${mutedTextClass}`} style={{ fontWeight: 650 }}>Loading saved payment methods...</p>
          </div>
        )}

        {!isLoading && methods.length === 0 && (
          <div className={`rounded-[22px] border-2 p-8 text-center ${surfaceClass}`}>
            <CreditCard className={`mx-auto mb-4 h-14 w-14 ${subtleTextClass}`} strokeWidth={1.8} />
            <h3 className={isDarkMode ? 'mb-2 text-[17px] text-white' : 'mb-2 text-[17px] text-slate-950'} style={{ fontWeight: 850 }}>No saved cards</h3>
            <p className={`text-[14px] ${mutedTextClass}`} style={{ fontWeight: 650 }}>Add a card through Stripe to speed up future parking checkout.</p>
          </div>
        )}

        {/* Payment Methods List */}
        {methods.map((method, index) => (
          <motion.div
            key={method.id}
            className={`rounded-[22px] border-2 p-4 ${surfaceClass}`}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...springConfig, delay: 0.05 + index * 0.05 }}
          >
            <div className="flex items-center gap-4">
              <div className={`flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-[14px] border-2 bg-gradient-to-br ${getMethodColor(method.type)}`}>
                {getMethodIcon(method.type)}
              </div>

              <div className="flex-1 min-w-0">
                <h3 className={isDarkMode ? 'mb-1 text-[17px] text-white' : 'mb-1 text-[17px] text-slate-950'} style={{ fontWeight: 850 }}>
                  {getMethodLabel(method)}
                </h3>
                {method.type === 'card' && method.expiryMonth && method.expiryYear && (
                  <p className={`text-[15px] ${mutedTextClass}`} style={{ fontWeight: 650 }}>
                    Expires {method.expiryMonth}/{method.expiryYear}
                  </p>
                )}
                {method.isDefault && (
                  <div className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-full text-[11px] bg-green-500/30 border border-green-400 text-green-200" style={{ fontWeight: 600 }}>
                    <Check className="w-3 h-3" strokeWidth={3} />
                    Default
                  </div>
                )}
              </div>

              <div className="flex gap-2">
                {!method.isDefault && (
                  <motion.button
                    onClick={() => handleSetDefault(method.id)}
                    className={isDarkMode ? 'rounded-[12px] border-2 border-slate-600 bg-slate-900 px-3 py-2 text-[13px] text-white' : 'rounded-[12px] border-2 border-slate-200 bg-slate-100 px-3 py-2 text-[13px] text-slate-950'}
                    style={{ fontWeight: 600 }}
                    whileTap={{ scale: 0.95 }}
                    transition={springConfig}
                  >
                    Set Default
                  </motion.button>
                )}

                <motion.button
                  onClick={() => handleDelete(method.id)}
                  className="w-10 h-10 rounded-full flex items-center justify-center bg-red-500/20 border-2 border-red-400/50 tap-target"
                  whileTap={{ scale: 0.9 }}
                  transition={springConfig}
                >
                  <Trash2 className="w-4 h-4 text-red-400" strokeWidth={2.5} />
                </motion.button>
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
