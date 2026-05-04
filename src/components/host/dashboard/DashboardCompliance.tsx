import { motion } from 'motion/react';
import {
  Shield,
  AlertTriangle,
  Clock,
  FileText,
  Lock,
  Activity,
  ChevronRight,
  CheckCircle2,
} from 'lucide-react';
import { useState } from 'react';
import { type ProviderDashboardAccess } from './providerDashboardAccess';
import { useProviderDashboardData } from '../../../utils/providerDashboardData';

interface DashboardComplianceProps {
  isDarkMode: boolean;
  access: ProviderDashboardAccess;
}

type ComplianceStatus = 'complete' | 'partial' | 'pending';
type ComplianceCategory = 'identity' | 'payouts' | 'catalog' | 'legal';

interface ComplianceItem {
  name: string;
  status: ComplianceStatus;
  details: string;
  guidance?: string;
}

interface ComplianceSection {
  category: ComplianceCategory;
  title: string;
  icon: any;
  color: string;
  items: ComplianceItem[];
}

export function DashboardCompliance({ isDarkMode, access }: DashboardComplianceProps) {
  const [selectedCategory, setSelectedCategory] = useState<ComplianceCategory | null>(null);
  const data = useProviderDashboardData();

  const springConfig = {
    type: "spring" as const,
    stiffness: 320,
    damping: 30,
    mass: 0.8,
  };

  const profileStatus: ComplianceStatus = data.vendor?.displayName ? 'complete' : 'pending';
  const approvalStatus: ComplianceStatus =
    data.vendor?.onboardingStatus === 'active' ? 'complete' :
    data.vendor?.onboardingStatus ? 'partial' : 'pending';
  const stripeStatus: ComplianceStatus = !data.authenticated
    ? 'pending'
    : data.connect.payoutsEnabled
      ? 'complete'
      : data.connect.connected
        ? 'partial'
        : 'pending';
  const taxStatus: ComplianceStatus = data.connect.payoutsEnabled ? 'complete' : 'pending';
  const catalogStatus: ComplianceStatus = data.activeServices > 0
    ? 'complete'
    : data.totalServices > 0
      ? 'partial'
      : 'pending';

  const complianceSections: ComplianceSection[] = [
    {
      category: 'identity',
      title: 'Business profile',
      icon: Shield,
      color: 'from-purple-500 to-fuchsia-500',
      items: [
        {
          name: 'Display name',
          status: profileStatus,
          details: data.vendor?.displayName
            ? `Listed publicly as "${data.vendor.displayName}".`
            : 'Add your business name before publishing services.',
          guidance: profileStatus !== 'complete' ? 'Update from Settings → Business Information.' : undefined,
        },
        {
          name: 'Operator approval',
          status: approvalStatus,
          details: data.vendor?.onboardingStatus === 'active'
            ? 'Operator approval is active.'
            : data.vendor?.onboardingStatus
              ? `Approval state: ${data.vendor.onboardingStatus}.`
              : 'Sign in with a provider account to view approval status.',
        },
      ],
    },
    {
      category: 'payouts',
      title: 'Payments & payouts',
      icon: Lock,
      color: 'from-emerald-500 to-teal-500',
      items: [
        {
          name: 'Stripe Connect',
          status: stripeStatus,
          details: data.connect.payoutsEnabled
            ? 'Stripe payouts are enabled.'
            : data.connect.connected
              ? 'Stripe is linked but payouts are not enabled yet.'
              : 'Connect a Stripe account to receive payouts.',
          guidance: data.connect.disabledReason ?? undefined,
        },
        {
          name: 'Tax & banking details',
          status: taxStatus,
          details: 'Tax forms and bank details are collected by Stripe during onboarding.',
        },
      ],
    },
    {
      category: 'catalog',
      title: 'Catalog readiness',
      icon: Activity,
      color: 'from-cyan-500 to-blue-500',
      items: [
        {
          name: 'Active services',
          status: catalogStatus,
          details: data.totalServices === 0
            ? 'No services published yet.'
            : `${data.activeServices} of ${data.totalServices} services are live.`,
          guidance: catalogStatus !== 'complete' ? 'Add or activate services from the Listings tab.' : undefined,
        },
      ],
    },
    {
      category: 'legal',
      title: 'Legal acknowledgements',
      icon: FileText,
      color: 'from-blue-500 to-indigo-500',
      items: [
        {
          name: 'Provider terms of service',
          status: 'complete',
          details: 'Provider terms accepted during onboarding.',
        },
        {
          name: 'Cancellation policy',
          status: 'partial',
          details: 'Default platform cancellation policy applies. Add your own copy per listing if needed.',
        },
      ],
    },
  ];

  if (access.isCottage) {
    return (
      <div className="rounded-[28px] border border-cyan-300/20 bg-cyan-500/10 p-6 text-white">
        <h1 className="text-[28px]" style={{ fontWeight: 850 }}>Cottage compliance checklist</h1>
        <p className="mt-2 max-w-xl text-[14px] leading-6 text-white/62">Cottage mode keeps compliance focused on essentials: clear customer instructions, safe patch placement, privacy-friendly data collection, and payout readiness.</p>
        <ol className="mt-5 grid gap-3 text-[14px] text-white/70 md:grid-cols-2">
          <li className="rounded-2xl bg-black/20 p-4">1. Publish accurate listing and access details.</li>
          <li className="rounded-2xl bg-black/20 p-4">2. Verify every patch before printing or sharing.</li>
          <li className="rounded-2xl bg-black/20 p-4">3. Keep guest communications inside approved channels.</li>
          <li className="rounded-2xl bg-black/20 p-4">4. Ask the Owner to review payout and tax settings.</li>
        </ol>
      </div>
    );
  }

  const getStatusIcon = (status: 'complete' | 'partial' | 'pending') => {
    switch (status) {
      case 'complete':
        return <CheckCircle2 className="w-5 h-5 text-green-400" strokeWidth={2.5} />;
      case 'partial':
        return <AlertTriangle className="w-5 h-5 text-yellow-400" strokeWidth={2.5} />;
      case 'pending':
        return <Clock className="w-5 h-5 text-orange-400" strokeWidth={2.5} />;
    }
  };

  const getStatusColor = (status: 'complete' | 'partial' | 'pending') => {
    switch (status) {
      case 'complete':
        return 'text-green-400';
      case 'partial':
        return 'text-yellow-400';
      case 'pending':
        return 'text-orange-400';
    }
  };

  const getStatusText = (status: 'complete' | 'partial' | 'pending') => {
    switch (status) {
      case 'complete':
        return 'Complete';
      case 'partial':
        return 'Partial';
      case 'pending':
        return 'Pending';
    }
  };

  const calculateOverallCompliance = () => {
    let totalItems = 0;
    let completedItems = 0;

    complianceSections.forEach((section) => {
      section.items.forEach((item) => {
        totalItems++;
        if (item.status === 'complete') {
          completedItems++;
        } else if (item.status === 'partial') {
          completedItems += 0.5;
        }
      });
    });

    if (totalItems === 0) return 0;
    return Math.round((completedItems / totalItems) * 100);
  };

  const overallCompliance = calculateOverallCompliance();
  const sectionStatus = (section: ComplianceSection): ComplianceStatus => {
    if (section.items.every((i) => i.status === 'complete')) return 'complete';
    if (section.items.some((i) => i.status === 'pending')) return 'pending';
    return 'partial';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={springConfig}
      >
        <h2 className="text-title-2 mb-2 text-white">
          Compliance
        </h2>
        <p className="text-[15px] text-white/70" style={{ fontWeight: 400 }}>
          Track the steps required to keep your business in good standing.
        </p>
      </motion.div>

      {/* Overall Compliance Score */}
      <motion.div
        className="rounded-[20px] p-6 border-2 border-white/30 bg-[#1C1C1E]/80 backdrop-blur-xl shadow-xl"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ ...springConfig, delay: 0.1 }}
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-[20px] mb-1 text-white" style={{ fontWeight: 600 }}>
              Overall Compliance
            </h3>
            <p className="text-[13px] text-white/60" style={{ fontWeight: 400 }}>
              Across all risk categories
            </p>
          </div>
          <div className="text-right">
            <div className="text-[34px] leading-none mb-1" style={{ fontWeight: 700 }}>
              <span className={`${
                overallCompliance >= 90 ? 'text-green-400' :
                overallCompliance >= 70 ? 'text-yellow-400' :
                'text-orange-400'
              }`}>
                {overallCompliance}%
              </span>
            </div>
            <p className="text-[11px] text-white/60" style={{ fontWeight: 500 }}>
              Account readiness
            </p>
          </div>
        </div>

        <div className="relative h-3 rounded-full bg-white/10 overflow-hidden">
          <motion.div
            className={`absolute inset-y-0 left-0 bg-gradient-to-r ${
              overallCompliance >= 90 ? 'from-green-500 to-emerald-400' :
              overallCompliance >= 70 ? 'from-yellow-500 to-amber-400' :
              'from-orange-500 to-red-400'
            }`}
            initial={{ width: 0 }}
            animate={{ width: `${overallCompliance}%` }}
            transition={{ ...springConfig, delay: 0.3 }}
          />
        </div>

        <div className="grid grid-cols-3 gap-4 mt-6">
          <div className="text-center">
            <div className="text-[24px] text-green-400 mb-1" style={{ fontWeight: 700 }}>
              {complianceSections.reduce((sum, s) => 
                sum + s.items.filter(i => i.status === 'complete').length, 0
              )}
            </div>
            <p className="text-[11px] text-white/60" style={{ fontWeight: 500 }}>
              Complete
            </p>
          </div>
          <div className="text-center">
            <div className="text-[24px] text-yellow-400 mb-1" style={{ fontWeight: 700 }}>
              {complianceSections.reduce((sum, s) => 
                sum + s.items.filter(i => i.status === 'partial').length, 0
              )}
            </div>
            <p className="text-[11px] text-white/60" style={{ fontWeight: 500 }}>
              Partial
            </p>
          </div>
          <div className="text-center">
            <div className="text-[24px] text-orange-400 mb-1" style={{ fontWeight: 700 }}>
              {complianceSections.reduce((sum, s) => 
                sum + s.items.filter(i => i.status === 'pending').length, 0
              )}
            </div>
            <p className="text-[11px] text-white/60" style={{ fontWeight: 500 }}>
              Pending
            </p>
          </div>
        </div>
      </motion.div>

      {/* Compliance Categories */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {complianceSections.map((section, index) => {
          const Icon = section.icon;
          const completedCount = section.items.filter(i => i.status === 'complete').length;
          const totalCount = section.items.length;
          const percentage = Math.round((completedCount / totalCount) * 100);

          return (
            <motion.button
              key={section.category}
              onClick={() => setSelectedCategory(
                selectedCategory === section.category ? null : section.category
              )}
              className="rounded-[20px] p-5 border-2 border-white/30 bg-[#1C1C1E]/80 backdrop-blur-xl shadow-xl text-left w-full"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...springConfig, delay: 0.2 + index * 0.05 }}
              whileTap={{ scale: 0.98 }}
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${section.color} flex items-center justify-center`}>
                    <Icon className="w-6 h-6 text-white" strokeWidth={2.5} />
                  </div>
                  <div>
                    <h3 className="text-[17px] mb-0.5 text-white" style={{ fontWeight: 600 }}>
                      {section.title}
                    </h3>
                    <p className="text-[13px] text-white/60" style={{ fontWeight: 400 }}>
                      {completedCount} of {totalCount} complete
                    </p>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2">
                  {getStatusIcon(sectionStatus(section))}
                  <ChevronRight
                    className={`w-4 h-4 text-white/40 transition-transform ${
                      selectedCategory === section.category ? 'rotate-90' : ''
                    }`}
                    strokeWidth={2.5}
                  />
                </div>
              </div>

              <div className="relative h-2 rounded-full bg-white/10 overflow-hidden mb-2">
                <div 
                  className={`absolute inset-y-0 left-0 bg-gradient-to-r ${section.color}`}
                  style={{ width: `${percentage}%` }}
                />
              </div>

              {/* Expanded Details */}
              {selectedCategory === section.category && (
                <motion.div
                  className="mt-4 pt-4 border-t border-white/20 space-y-3"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={springConfig}
                >
                  {section.items.map((item, itemIndex) => (
                    <div
                      key={itemIndex}
                      className="rounded-xl p-3 bg-white/5"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2">
                          {getStatusIcon(item.status)}
                          <span className="text-[15px] text-white" style={{ fontWeight: 600 }}>
                            {item.name}
                          </span>
                        </div>
                        <span className={`text-[13px] ${getStatusColor(item.status)}`} style={{ fontWeight: 600 }}>
                          {getStatusText(item.status)}
                        </span>
                      </div>
                      <p className="text-[13px] text-white/70 mb-2" style={{ fontWeight: 400 }}>
                        {item.details}
                      </p>
                      {item.guidance && (
                        <p className="text-[12px] text-white/55" style={{ fontWeight: 400 }}>
                          {item.guidance}
                        </p>
                      )}
                    </div>
                  ))}
                </motion.div>
              )}
            </motion.button>
          );
        })}
      </div>

      {/* Outstanding items */}
      {(() => {
        const outstanding = complianceSections.flatMap((s) =>
          s.items.filter((i) => i.status !== 'complete').map((i) => ({ section: s.title, ...i }))
        );
        if (outstanding.length === 0) {
          return (
            <motion.div
              className="rounded-[20px] p-5 border-2 border-green-500/30 bg-gradient-to-br from-green-500/10 to-emerald-500/5 backdrop-blur-xl shadow-xl"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...springConfig, delay: 0.5 }}
            >
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle2 className="w-5 h-5 text-green-400" strokeWidth={2.5} />
                <h3 className="text-[17px] text-white" style={{ fontWeight: 600 }}>
                  You're all set
                </h3>
              </div>
              <p className="text-[14px] text-white/70" style={{ fontWeight: 400 }}>
                All compliance items are up to date. We'll let you know if anything changes.
              </p>
            </motion.div>
          );
        }
        return (
          <motion.div
            className="rounded-[20px] p-5 border-2 border-orange-500/30 bg-gradient-to-br from-orange-500/10 to-amber-500/5 backdrop-blur-xl shadow-xl"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...springConfig, delay: 0.5 }}
          >
            <div className="flex items-center gap-2 mb-4">
              <AlertTriangle className="w-5 h-5 text-orange-400" strokeWidth={2.5} />
              <h3 className="text-[17px] text-white" style={{ fontWeight: 600 }}>
                Action items
              </h3>
            </div>
            <ul className="space-y-2 text-[14px] text-white/90" style={{ fontWeight: 400 }}>
              {outstanding.map((item, idx) => (
                <li key={`${item.section}-${idx}`} className="flex items-start gap-2">
                  <span className="text-orange-400 mt-0.5">•</span>
                  <span>
                    <span className="text-white/60">{item.section}:</span>{' '}
                    <span>{item.guidance ?? item.details}</span>
                  </span>
                </li>
              ))}
            </ul>
          </motion.div>
        );
      })()}
    </div>
  );
}
