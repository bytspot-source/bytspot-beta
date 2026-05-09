import { motion } from 'motion/react';
import { ArrowLeft, Plus, CreditCard, Trash2, Check, Shield, Loader2, ExternalLink } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner@2.0.3';
import { trpc } from '../utils/trpc';

interface PaymentMethodsProps {
  isDarkMode: boolean;
  onBack: () => void;
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

export function PaymentMethods({ isDarkMode, onBack }: PaymentMethodsProps) {
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isStartingSetup, setIsStartingSetup] = useState(false);
  const [showAddCard, setShowAddCard] = useState(false);

  const loadMethods = async () => {
    setIsLoading(true);
    try {
      const result = await trpc.payments.listMethods.query();
      setMethods((result ?? []) as PaymentMethod[]);
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
        return 'from-blue-500/40 to-cyan-500/40 border-blue-400/30';
      case 'apple_pay':
        return 'from-gray-700/40 to-gray-900/40 border-gray-400/30';
      case 'google_pay':
        return 'from-green-500/40 to-emerald-500/40 border-green-400/30';
      case 'paypal':
        return 'from-blue-600/40 to-blue-800/40 border-blue-500/30';
      default:
        return 'from-purple-500/40 to-pink-500/40 border-purple-400/30';
    }
  };

  const handleSetDefault = async (id: string) => {
    try {
      await trpc.payments.setDefaultMethod.mutate({ paymentMethodId: id });
      setMethods(methods.map(m => ({ ...m, isDefault: m.id === id })));
      toast.success('Default payment method updated');
    } catch (err: any) {
      toast.error('Unable to update default', { description: err?.message ?? 'Please try again.' });
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await trpc.payments.removeMethod.mutate({ paymentMethodId: id });
      setMethods(methods.filter(m => m.id !== id));
      toast.success('Payment method removed');
    } catch (err: any) {
      toast.error('Unable to remove payment method', { description: err?.message ?? 'Please try again.' });
    }
  };

  const handleAddCard = async () => {
    setIsStartingSetup(true);
    try {
      const result = await trpc.payments.setupSession.mutate({
        successPath: '/profile/payment',
        cancelPath: '/profile/payment',
      });
      if (result?.url) {
        window.location.href = result.url;
        return;
      }
      toast.error('Unable to start secure card setup');
    } catch (err: any) {
      toast.error('Unable to start secure card setup', { description: err?.message ?? 'Please try again.' });
    } finally {
      setIsStartingSetup(false);
    }
  };

  if (showAddCard) {
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
            onClick={() => setShowAddCard(false)}
            className="w-10 h-10 rounded-full flex items-center justify-center bg-[#1C1C1E]/80 backdrop-blur-xl border-2 border-white/30 shadow-xl tap-target"
            whileTap={{ scale: 0.9 }}
            transition={springConfig}
          >
            <ArrowLeft className="w-5 h-5 text-white" strokeWidth={2.5} />
          </motion.button>
          <h1 className="text-title-2 text-white">
            Add Card
          </h1>
        </motion.div>

        <div className="px-4 space-y-6">
          {/* Security Notice */}
          <motion.div
            className="rounded-[20px] p-4 border-2 border-green-500/30 bg-gradient-to-br from-green-500/20 to-emerald-500/20"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...springConfig, delay: 0.1 }}
          >
            <div className="flex items-start gap-3">
              <Shield className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" strokeWidth={2.5} />
              <div>
                <h3 className="text-[15px] mb-1 text-white" style={{ fontWeight: 600 }}>
                  PCI-DSS Compliant
                </h3>
                <p className="text-[13px] text-white/80" style={{ fontWeight: 400 }}>
                  Your payment information is encrypted and securely stored. We never see or store your CVV.
                </p>
              </div>
            </div>
          </motion.div>

          {/* Hosted Stripe Card Setup */}
          <motion.div
            className="rounded-[24px] p-6 border-2 border-white/30 bg-[#1C1C1E]/80 backdrop-blur-xl shadow-xl"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...springConfig, delay: 0.15 }}
          >
            <h3 className="text-[17px] mb-4 text-white" style={{ fontWeight: 600 }}>
              Secure Stripe setup
            </h3>
            <p className="text-[14px] leading-5 text-white/75" style={{ fontWeight: 400 }}>
              You will be redirected to Stripe Checkout to add a card. Bytspot never receives or stores raw card numbers, expiry dates, or CVV values.
            </p>
          </motion.div>

          {/* Add Button */}
          <motion.button
            onClick={handleAddCard}
            disabled={isStartingSetup}
            className="w-full rounded-[20px] px-6 py-4 flex items-center justify-center gap-2 border-2 border-white/30 bg-gradient-to-br from-purple-500 to-pink-500 text-white shadow-xl disabled:opacity-60"
            whileTap={{ scale: 0.98 }}
            transition={springConfig}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
          >
            {isStartingSetup ? <Loader2 className="w-5 h-5 animate-spin" strokeWidth={2.5} /> : <ExternalLink className="w-5 h-5" strokeWidth={2.5} />}
            <span className="text-[17px]" style={{ fontWeight: 600 }}>
              {isStartingSetup ? 'Opening Stripe...' : 'Continue to Stripe'}
            </span>
          </motion.button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto pb-24">
      {/* Header */}
      <motion.div
        className="px-4 pt-4 pb-4 flex items-center justify-between sticky top-0 bg-[#000000] z-10"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={springConfig}
      >
        <div className="flex items-center gap-3">
          <motion.button
            onClick={onBack}
            className="w-10 h-10 rounded-full flex items-center justify-center bg-[#1C1C1E]/80 backdrop-blur-xl border-2 border-white/30 shadow-xl tap-target"
            whileTap={{ scale: 0.9 }}
            transition={springConfig}
          >
            <ArrowLeft className="w-5 h-5 text-white" strokeWidth={2.5} />
          </motion.button>
          <h1 className="text-title-2 text-white">
            Payment Methods
          </h1>
        </div>

        <motion.button
          onClick={() => setShowAddCard(true)}
          className="w-10 h-10 rounded-full flex items-center justify-center bg-gradient-to-br from-purple-500 to-pink-500 border-2 border-white/30 shadow-xl tap-target"
          whileTap={{ scale: 0.9 }}
          transition={springConfig}
        >
          <Plus className="w-5 h-5 text-white" strokeWidth={2.5} />
        </motion.button>
      </motion.div>

      <div className="px-4 space-y-4">
        {/* Security Notice */}
        <motion.div
          className="rounded-[20px] p-4 border-2 border-white/30 bg-[#1C1C1E]/80 backdrop-blur-xl shadow-lg"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={springConfig}
        >
          <div className="flex items-start gap-3">
            <Shield className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" strokeWidth={2.5} />
            <div>
              <p className="text-[13px] text-white/80" style={{ fontWeight: 400 }}>
                All payment methods are encrypted and PCI-DSS compliant
              </p>
            </div>
          </div>
        </motion.div>

        {isLoading && (
          <div className="rounded-[20px] p-8 border-2 border-white/30 bg-[#1C1C1E]/80 backdrop-blur-xl text-center">
            <Loader2 className="w-8 h-8 text-purple-300 animate-spin mx-auto mb-3" />
            <p className="text-[15px] text-white/75" style={{ fontWeight: 500 }}>Loading saved payment methods...</p>
          </div>
        )}

        {!isLoading && methods.length === 0 && (
          <div className="rounded-[20px] p-8 border-2 border-white/30 bg-[#1C1C1E]/80 backdrop-blur-xl text-center">
            <CreditCard className="w-14 h-14 text-white/35 mx-auto mb-4" strokeWidth={1.6} />
            <h3 className="text-[17px] text-white mb-2" style={{ fontWeight: 600 }}>No saved cards</h3>
            <p className="text-[14px] text-white/70" style={{ fontWeight: 400 }}>Add a card through Stripe to speed up future parking checkout.</p>
          </div>
        )}

        {/* Payment Methods List */}
        {methods.map((method, index) => (
          <motion.div
            key={method.id}
            className="rounded-[20px] p-4 border-2 border-white/30 bg-[#1C1C1E]/80 backdrop-blur-xl shadow-xl"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...springConfig, delay: 0.05 + index * 0.05 }}
          >
            <div className="flex items-center gap-4">
              <div className={`w-14 h-14 rounded-[12px] flex items-center justify-center bg-gradient-to-br ${getMethodColor(method.type)} border-2 flex-shrink-0`}>
                {getMethodIcon(method.type)}
              </div>

              <div className="flex-1 min-w-0">
                <h3 className="text-[17px] mb-1 text-white" style={{ fontWeight: 600 }}>
                  {getMethodLabel(method)}
                </h3>
                {method.type === 'card' && method.expiryMonth && method.expiryYear && (
                  <p className="text-[15px] text-white/80" style={{ fontWeight: 400 }}>
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
                    className="px-3 py-2 rounded-[12px] text-[13px] bg-white/10 border-2 border-white/30 text-white"
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
