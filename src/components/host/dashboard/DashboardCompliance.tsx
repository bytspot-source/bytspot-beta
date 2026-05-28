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
  Scale,
  BadgeCheck,
  Bot,
  Library,
  Umbrella,
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
type ChecklistStatus = 'Required' | 'Recommended' | 'Strongly recommended' | 'Not required';

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

const TOP_LEGAL_NOTICE = '⚠️ This is general information only. Bytspot is not a law firm. Compliance rules change and vary by location. Always verify with official sources or consult a qualified attorney.';
const CHECKLIST_LEGAL_NOTICE = 'Bytspot provides this checklist for informational purposes. We do not guarantee compliance. Laws change frequently. You are responsible for meeting all local, state, and federal requirements.';
const FOOTER_LEGAL_NOTICE = 'General guidance only. Not legal advice. Consult official sources or an attorney.';
const AI_LEGAL_NOTICE = 'This AI assistant gives general answers based on public information. It is not a substitute for professional legal advice.';

const hubSections = [
  { title: 'My Personalized Checklist', detail: 'Recommended next steps based on service type, region, and verification state.', icon: CheckCircle2, color: 'from-cyan-400 to-blue-500' },
  { title: 'Resource Library', detail: 'Official-source links, plain-language explainers, and platform readiness notes.', icon: Library, color: 'from-violet-400 to-fuchsia-500' },
  { title: 'Verification Badges', detail: 'Track training, insurance, license, and review badges that can build customer trust.', icon: BadgeCheck, color: 'from-emerald-400 to-teal-500' },
  { title: 'Insurance Partners', detail: 'Explore coverage categories and partner referrals where available.', icon: Umbrella, color: 'from-amber-400 to-orange-500' },
  { title: 'Ask Compliance Assistant', detail: `AI-powered general guidance. ${AI_LEGAL_NOTICE}`, icon: Bot, color: 'from-slate-300 to-cyan-400' },
];

const georgiaChecklists: Array<{
  title: string;
  subtitle: string;
  items: Array<{ label: string; status: ChecklistStatus; detail: string }>;
}> = [
  {
    title: 'Private Chef / Cottage Food',
    subtitle: 'Georgia-focused sample checklist · 2026',
    items: [
      { label: 'Complete ANSI-accredited Food Handler training', status: 'Required', detail: 'Georgia cottage food rules are provider-friendly, but food handler training remains mandatory.' },
      { label: 'Register business name', status: 'Recommended', detail: 'DBA or LLC registration is recommended depending on how you operate and market the service.' },
      { label: 'Follow proper labeling', status: 'Required', detail: 'Use “Made in a home kitchen” plus allergen information where applicable.' },
      { label: 'Liability insurance', status: 'Strongly recommended', detail: '$1M liability coverage is a common baseline for customer trust.' },
      { label: 'Keep temperature logs if applicable', status: 'Recommended', detail: 'Maintain practical records for temperature-sensitive ingredients or prepared items.' },
      { label: 'Understand sales channels', status: 'Recommended', detail: 'Direct, online, and retail sales are allowed under Georgia HB 398; verify current official guidance.' },
    ],
  },
  {
    title: 'Mobile Massage / Wellness Therapist',
    subtitle: 'Georgia-focused sample checklist · 2026',
    items: [
      { label: 'Valid Georgia Massage Therapy License', status: 'Required', detail: 'Verify active standing with the Georgia Board of Massage Therapy.' },
      { label: 'Professional liability insurance', status: 'Required', detail: 'Required for Bytspot platform verification before wellness services enter Station Mode.' },
      { label: 'Client intake & consent forms', status: 'Required', detail: 'Collect informed consent, health intake, and session boundaries before appointments.' },
      { label: 'Background check', status: 'Recommended', detail: 'Recommended for customer trust and high-touch in-home or hotel services.' },
      { label: 'Maintain private, clean treatment space', status: 'Required', detail: 'Use sanitation, privacy, and setup standards appropriate for wellness appointments.' },
    ],
  },
  {
    title: 'Valet / Transportation Service',
    subtitle: 'Georgia-focused sample checklist · 2026',
    items: [
      { label: 'Valid driver’s license + clean MVR', status: 'Required', detail: 'Verify license status and motor vehicle record for every driver.' },
      { label: 'Commercial auto insurance', status: 'Required', detail: 'Use commercial coverage appropriate for paid transportation or valet operations.' },
      { label: 'Business registration', status: 'Required', detail: 'Register the operating business before accepting paid jobs.' },
      { label: 'Vehicle maintenance records', status: 'Required', detail: 'Maintain regular maintenance records for vehicles used in service.' },
      { label: 'Passenger liability coverage', status: 'Required', detail: 'Confirm coverage applies to passenger transport or valet handoffs where applicable.' },
    ],
  },
];

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
          name: 'Station Mode services',
          status: catalogStatus,
          details: data.totalServices === 0
            ? 'No services published yet.'
            : `${data.activeServices} of ${data.totalServices} services are in Station Mode.`,
          guidance: catalogStatus !== 'complete' ? 'Add or activate services from My Services.' : undefined,
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
  const statusTone = (status: ChecklistStatus) => {
    switch (status) {
      case 'Required':
        return 'border-orange-300 bg-orange-900 text-orange-50';
      case 'Recommended':
        return 'border-cyan-300 bg-cyan-900 text-cyan-50';
      case 'Strongly recommended':
        return 'border-amber-300 bg-amber-900 text-amber-50';
      case 'Not required':
        return 'border-emerald-300 bg-emerald-900 text-emerald-50';
    }
  };
  const sectionStatus = (section: ComplianceSection): ComplianceStatus => {
    if (section.items.every((i) => i.status === 'complete')) return 'complete';
    if (section.items.some((i) => i.status === 'pending')) return 'pending';
    return 'partial';
  };
  const quickStatusCards = [
    { label: 'Food Safety Training', value: data.totalServices > 0 ? 'Not Started' : 'Not Started', tone: 'border-orange-300 bg-orange-900 text-orange-50' },
    { label: 'Business Registration', value: profileStatus === 'complete' ? 'Done' : 'Pending', tone: profileStatus === 'complete' ? 'border-emerald-300 bg-emerald-900 text-emerald-50' : 'border-amber-300 bg-amber-900 text-amber-50' },
    { label: 'Insurance', value: 'Recommended', tone: 'border-cyan-300 bg-cyan-900 text-cyan-50' },
    { label: 'Overall Readiness', value: '65% Complete', tone: 'border-violet-300 bg-violet-900 text-violet-50' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={springConfig}
      >
        <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-cyan-300 bg-cyan-900 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-cyan-50" style={{ fontWeight: 850 }}>
          <Scale className="h-3.5 w-3.5" strokeWidth={2.5} /> Compliance Hub
        </div>
        <h2 className="text-title-2 mb-2 text-white">
          Compliance Hub
        </h2>
        <p className="text-[15px] text-slate-100" style={{ fontWeight: 500 }}>
          Grow legally. Operate with confidence.
        </p>
      </motion.div>

      <motion.div
        className="rounded-[22px] border-2 border-amber-300 bg-amber-900 p-5 text-amber-50 shadow-xl shadow-black/40"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...springConfig, delay: 0.05 }}
        data-testid="provider-compliance-legal-notice"
      >
        <p className="text-[14px] leading-6" style={{ fontWeight: 750 }}>{TOP_LEGAL_NOTICE}</p>
      </motion.div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-4" data-testid="provider-compliance-quick-status">
        {quickStatusCards.map((card, index) => (
          <motion.div
            key={card.label}
            className={`rounded-[20px] border p-4 shadow-lg shadow-black/25 ${card.tone}`}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...springConfig, delay: 0.07 + index * 0.03 }}
          >
            <p className="text-[11px] uppercase tracking-[0.14em] text-slate-100" style={{ fontWeight: 850 }}>{card.label}</p>
            <p className="mt-2 text-[18px]" style={{ fontWeight: 850 }}>{card.value}</p>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5" data-testid="provider-compliance-main-sections">
        {hubSections.map((section, index) => {
          const Icon = section.icon;
          return (
            <motion.section
              key={section.title}
              className="rounded-[22px] border-2 border-slate-500 bg-slate-800 p-4 text-white shadow-xl shadow-black/45 ring-1 ring-cyan-300/20"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...springConfig, delay: 0.1 + index * 0.04 }}
            >
              <div className={`mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br ${section.color}`}>
                <Icon className="h-5 w-5 text-white" strokeWidth={2.5} />
              </div>
              <h3 className="text-[15px] leading-5" style={{ fontWeight: 850 }}>{section.title}</h3>
              <p className="mt-2 text-[12px] leading-5 text-slate-100">{section.detail}</p>
            </motion.section>
          );
        })}
      </div>

      <motion.div
        className="rounded-[22px] border-2 border-cyan-300 bg-cyan-900 p-5 text-cyan-50 shadow-xl shadow-black/40"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...springConfig, delay: 0.16 }}
        data-testid="provider-compliance-regulatory-context"
      >
        <h3 className="text-[18px]" style={{ fontWeight: 850 }}>Federal AI & Cottage Regulation Context · 2026</h3>
        <div className="mt-3 grid gap-3 text-[13px] leading-6 text-slate-50 md:grid-cols-2">
          <p><span className="text-white" style={{ fontWeight: 850 }}>Cottage food:</span> Primarily state-level. Georgia’s HB 398 is provider-friendly: no state license required, no sales cap, retail sales allowed, and food handler training remains mandatory. There is no comprehensive federal cottage food law; FDA provides general food safety guidelines.</p>
          <p><span className="text-white" style={{ fontWeight: 850 }}>AI transparency:</span> There is no single comprehensive federal AI law yet. Key platform principles are transparency, accountability, risk-based guidance, consent for data use, data minimization, and avoiding deceptive AI claims.</p>
        </div>
      </motion.div>

      <motion.div
        className="rounded-[20px] border-2 border-amber-300 bg-amber-900 p-4 text-amber-50"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...springConfig, delay: 0.18 }}
        data-testid="provider-compliance-checklist-legal-notice"
      >
        <p className="text-[13px] leading-6" style={{ fontWeight: 750 }}>{CHECKLIST_LEGAL_NOTICE}</p>
      </motion.div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3" data-testid="provider-compliance-georgia-checklists">
        {georgiaChecklists.map((checklist, index) => (
          <motion.section
            key={checklist.title}
            className="rounded-[22px] border-2 border-slate-500 bg-slate-800 p-5 text-white shadow-xl shadow-black/45 ring-1 ring-cyan-300/20"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...springConfig, delay: 0.08 + index * 0.04 }}
          >
            <h3 className="text-[18px]" style={{ fontWeight: 850 }}>{checklist.title}</h3>
            <p className="mt-1 text-[12px] text-slate-100" style={{ fontWeight: 650 }}>{checklist.subtitle}</p>
            <div className="mt-4 space-y-3">
              {checklist.items.map((item) => (
                <div key={`${checklist.title}-${item.label}`} className="rounded-2xl border border-slate-500 bg-slate-700 p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <p className="text-[13px] text-white" style={{ fontWeight: 800 }}>{item.label}</p>
                    <span className={`rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-[0.12em] ${statusTone(item.status)}`} style={{ fontWeight: 850 }}>{item.status}</span>
                  </div>
                  <p className="mt-2 text-[12px] leading-5 text-slate-100">{item.detail}</p>
                </div>
              ))}
            </div>
          </motion.section>
        ))}
      </div>

      {/* Overall Compliance Score */}
      <motion.div
        className="rounded-[20px] border-2 border-slate-500 bg-slate-800 p-6 shadow-xl shadow-black/45"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ ...springConfig, delay: 0.1 }}
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-[20px] mb-1 text-white" style={{ fontWeight: 600 }}>
              Overall Compliance
            </h3>
            <p className="text-[13px] text-slate-100" style={{ fontWeight: 500 }}>
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
            <p className="text-[11px] text-slate-100" style={{ fontWeight: 600 }}>
              Account readiness
            </p>
          </div>
        </div>

        <div className="relative h-3 overflow-hidden rounded-full bg-slate-600">
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
            <p className="text-[11px] text-slate-100" style={{ fontWeight: 600 }}>
              Complete
            </p>
          </div>
          <div className="text-center">
            <div className="text-[24px] text-yellow-400 mb-1" style={{ fontWeight: 700 }}>
              {complianceSections.reduce((sum, s) => 
                sum + s.items.filter(i => i.status === 'partial').length, 0
              )}
            </div>
            <p className="text-[11px] text-slate-100" style={{ fontWeight: 600 }}>
              Partial
            </p>
          </div>
          <div className="text-center">
            <div className="text-[24px] text-orange-400 mb-1" style={{ fontWeight: 700 }}>
              {complianceSections.reduce((sum, s) => 
                sum + s.items.filter(i => i.status === 'pending').length, 0
              )}
            </div>
            <p className="text-[11px] text-slate-100" style={{ fontWeight: 600 }}>
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
              className="w-full rounded-[20px] border-2 border-slate-500 bg-slate-800 p-5 text-left shadow-xl shadow-black/45"
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
                    <p className="text-[13px] text-slate-100" style={{ fontWeight: 500 }}>
                      {completedCount} of {totalCount} complete
                    </p>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2">
                  {getStatusIcon(sectionStatus(section))}
                  <ChevronRight
                    className={`h-4 w-4 text-slate-300 transition-transform ${
                      selectedCategory === section.category ? 'rotate-90' : ''
                    }`}
                    strokeWidth={2.5}
                  />
                </div>
              </div>

              <div className="relative mb-2 h-2 overflow-hidden rounded-full bg-slate-600">
                <div 
                  className={`absolute inset-y-0 left-0 bg-gradient-to-r ${section.color}`}
                  style={{ width: `${percentage}%` }}
                />
              </div>

              {/* Expanded Details */}
              {selectedCategory === section.category && (
                <motion.div
                  className="mt-4 space-y-3 border-t border-slate-500 pt-4"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={springConfig}
                >
                  {section.items.map((item, itemIndex) => (
                    <div
                      key={itemIndex}
                      className="rounded-xl border border-slate-500 bg-slate-700 p-3"
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
                      <p className="mb-2 text-[13px] text-slate-100" style={{ fontWeight: 500 }}>
                        {item.details}
                      </p>
                      {item.guidance && (
                        <p className="text-[12px] text-slate-200" style={{ fontWeight: 500 }}>
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
              className="rounded-[20px] border-2 border-emerald-300 bg-emerald-900 p-5 shadow-xl shadow-black/40"
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
              <p className="text-[14px] text-slate-50" style={{ fontWeight: 500 }}>
                All compliance items are up to date. We'll let you know if anything changes.
              </p>
            </motion.div>
          );
        }
        return (
          <motion.div
            className="rounded-[20px] border-2 border-orange-300 bg-orange-900 p-5 shadow-xl shadow-black/40"
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
            <ul className="space-y-2 text-[14px] text-slate-50" style={{ fontWeight: 500 }}>
              {outstanding.map((item, idx) => (
                <li key={`${item.section}-${idx}`} className="flex items-start gap-2">
                  <span className="text-orange-400 mt-0.5">•</span>
                  <span>
                    <span className="text-orange-100">{item.section}:</span>{' '}
                    <span>{item.guidance ?? item.details}</span>
                  </span>
                </li>
              ))}
            </ul>
          </motion.div>
        );
      })()}

      <p className="rounded-2xl border border-slate-500 bg-slate-800 px-4 py-3 text-center text-[12px] leading-5 text-slate-100" data-testid="provider-compliance-footer-disclaimer">
        {FOOTER_LEGAL_NOTICE}
      </p>
    </div>
  );
}
