import { motion } from 'motion/react';
import { ArrowLeft, Plus, CreditCard, Smartphone, Edit, Trash2, Check, Shield } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner@2.0.3';

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
  const [methods, setMethods] = useState<PaymentMethod[]>([
    {
      id: '1',
      type: 'card',
      last4: '4242',
      brand: 'Visa',
      expiryMonth: '12',
      expiryYear: '25',
      isDefault: true,
    },
    {
      id: '2',
      type: 'apple_pay',
      isDefault: false,
    },
  ]);

  const [showAddCard, setShowAddCard] = useState(false);
  const [cardData, setCardData] = useState({
    number: '',
    name: '',
    expiry: '',
    cvv: '',
  });

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
        return <Smartphone className="w-5 h-5" strokeWidth={2.5} />;
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

  const handleSetDefault = (id: string) => {
    setMethods(methods.map(m => ({ ...m, isDefault: m.id === id })));
    toast.success('Default payment method updated');
  };

  const handleDelete = (id: string) => {
    const method = methods.find(m => m.id === id);
    if (method?.isDefault && methods.length > 1) {
      toast.error('Cannot delete default payment method', {
        description: 'Please set another method as default first',
      });
      return;
    }
    setMethods(methods.filter(m => m.id !== id));
    toast.success('Payment method removed');
  };

  const handleAddCard = () => {
    if (!cardData.number || !cardData.name || !cardData.expiry || !cardData.cvv) {
      toast.error('Please fill all fields');
      return;
    }

    // Basic validation
    if (cardData.number.replace(/\s/g, '').length !== 16) {
      toast.error('Invalid card number');
      return;
    }

    const newCard: PaymentMethod = {
      id: Date.now().toString(),
      type: 'card',
      last4: cardData.number.slice(-4),
      brand: 'Visa', // In real app, detect from card number
      expiryMonth: cardData.expiry.split('/')[0],
      expiryYear: cardData.expiry.split('/')[1],
      isDefault: methods.length === 0,
    };

    setMethods([...methods, newCard]);
    toast.success('Card added successfully');
    setShowAddCard(false);
    setCardData({ number: '', name: '', expiry: '', cvv: '' });
  };

  const formatCardNumber = (value: string) => {
    const v = value.replace(/\s+/g, '').replace(/[^0-9]/gi, '');
    const matches = v.match(/\d{4,16}/g);
    const match = (matches && matches[0]) || '';
    const parts = [];

    for (let i = 0, len = match.length; i < len; i += 4) {
      parts.push(match.substring(i, i + 4));
    }

    if (parts.length) {
      return parts.join(' ');
    } else {
      return value;
    }
  };

  const formatExpiry = (value: string) => {
    const v = value.replace(/\s+/g, '').replace(/[^0-9]/gi, '');
    if (v.length >= 2) {
      return v.slice(0, 2) + '/' + v.slice(2, 4);
    }
    return v;
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

          {/* Card Form */}
          <motion.div
            className="rounded-[24px] p-6 border-2 border-white/30 bg-[#1C1C1E]/80 backdrop-blur-xl shadow-xl"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...springConfig, delay: 0.15 }}
          >
            <h3 className="text-[17px] mb-4 text-white" style={{ fontWeight: 600 }}>
              Card Information
            </h3>
            
            <div className="space-y-4">
              {/* Card Number */}
              <div>
                <label className="text-[13px] text-white/80 mb-2 block" style={{ fontWeight: 500 }}>
                  Card Number
                </label>
                <input
                  type="text"
                  value={cardData.number}
                  onChange={(e) => setCardData({ ...cardData, number: formatCardNumber(e.target.value) })}
                  placeholder="1234 5678 9012 3456"
                  maxLength={19}
                  className="w-full rounded-[16px] px-4 py-3 border-2 border-white/30 bg-white/5 text-[17px] outline-none text-white placeholder:text-white/40"
                  style={{ fontWeight: 600, letterSpacing: '0.5px' }}
                />
              </div>

              {/* Cardholder Name */}
              <div>
                <label className="text-[13px] text-white/80 mb-2 block" style={{ fontWeight: 500 }}>
                  Cardholder Name
                </label>
                <input
                  type="text"
                  value={cardData.name}
                  onChange={(e) => setCardData({ ...cardData, name: e.target.value.toUpperCase() })}
                  placeholder="JOHN DOE"
                  className="w-full rounded-[16px] px-4 py-3 border-2 border-white/30 bg-white/5 text-[15px] outline-none text-white placeholder:text-white/40 uppercase"
                  style={{ fontWeight: 600 }}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                {/* Expiry */}
                <div>
                  <label className="text-[13px] text-white/80 mb-2 block" style={{ fontWeight: 500 }}>
                    Expiry
                  </label>
                  <input
                    type="text"
                    value={cardData.expiry}
                    onChange={(e) => setCardData({ ...cardData, expiry: formatExpiry(e.target.value) })}
                    placeholder="MM/YY"
                    maxLength={5}
                    className="w-full rounded-[16px] px-4 py-3 border-2 border-white/30 bg-white/5 text-[15px] outline-none text-white placeholder:text-white/40"
                    style={{ fontWeight: 600 }}
                  />
                </div>

                {/* CVV */}
                <div>
                  <label className="text-[13px] text-white/80 mb-2 block" style={{ fontWeight: 500 }}>
                    CVV
                  </label>
                  <input
                    type="password"
                    value={cardData.cvv}
                    onChange={(e) => setCardData({ ...cardData, cvv: e.target.value.replace(/\D/g, '').slice(0, 4) })}
                    placeholder="123"
                    maxLength={4}
                    className="w-full rounded-[16px] px-4 py-3 border-2 border-white/30 bg-white/5 text-[15px] outline-none text-white placeholder:text-white/40"
                    style={{ fontWeight: 600 }}
                  />
                </div>
              </div>
            </div>
          </motion.div>

          {/* Add Button */}
          <motion.button
            onClick={handleAddCard}
            className="w-full rounded-[20px] px-6 py-4 flex items-center justify-center gap-2 border-2 border-white/30 bg-gradient-to-br from-purple-500 to-pink-500 text-white shadow-xl"
            whileTap={{ scale: 0.98 }}
            transition={springConfig}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <Plus className="w-5 h-5" strokeWidth={2.5} />
            <span className="text-[17px]" style={{ fontWeight: 600 }}>
              Add Card
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
