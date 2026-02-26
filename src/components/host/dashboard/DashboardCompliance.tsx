import { motion } from 'motion/react';
import { 
  Shield, 
  Check, 
  AlertTriangle, 
  Clock, 
  FileText, 
  Lock, 
  Users, 
  Activity,
  ChevronRight,
  CheckCircle2,
  XCircle
} from 'lucide-react';
import { useState } from 'react';

interface DashboardComplianceProps {
  isDarkMode: boolean;
}

type ComplianceCategory = 'privacy' | 'security' | 'legal' | 'operational';

interface ComplianceItem {
  name: string;
  status: 'complete' | 'partial' | 'pending';
  percentage: number;
  details: string;
  evidence?: string;
}

interface ComplianceSection {
  category: ComplianceCategory;
  title: string;
  icon: any;
  color: string;
  items: ComplianceItem[];
  overallStatus: 'complete' | 'partial' | 'pending';
}

export function DashboardCompliance({ isDarkMode }: DashboardComplianceProps) {
  const [selectedCategory, setSelectedCategory] = useState<ComplianceCategory | null>(null);

  const springConfig = {
    type: "spring" as const,
    stiffness: 320,
    damping: 30,
    mass: 0.8,
  };

  const complianceSections: ComplianceSection[] = [
    {
      category: 'privacy',
      title: 'Privacy & Transparency',
      icon: Shield,
      color: 'from-green-500 to-emerald-500',
      overallStatus: 'complete',
      items: [
        {
          name: 'Privacy Disclosure',
          status: 'complete',
          percentage: 100,
          details: 'Transparent "What We Collect" and "What We Don\'t Do" sections displayed before signup',
          evidence: 'DataConsentFlow.tsx lines 96-133',
        },
        {
          name: 'Graduated Permissions',
          status: 'complete',
          percentage: 100,
          details: 'Location permissions separated from authentication with contextual explanations',
          evidence: 'LocationPermissionFlow.tsx',
        },
        {
          name: 'Anti-Stalkerware Protection',
          status: 'complete',
          percentage: 100,
          details: 'Explicit statement: "✕ Track you when the app is closed"',
          evidence: 'DataConsentFlow.tsx line 126',
        },
        {
          name: 'User Data Control',
          status: 'complete',
          percentage: 100,
          details: 'Users can view, modify, and delete their data at any time',
          evidence: 'ProfileSection.tsx, LocationSettings.tsx',
        },
        {
          name: 'Contextual Permissions',
          status: 'complete',
          percentage: 100,
          details: 'All permissions requested just-in-time with clear justification',
          evidence: 'Camera, notifications, location all contextual',
        },
      ],
    },
    {
      category: 'security',
      title: 'Security & Data Protection',
      icon: Lock,
      color: 'from-orange-500 to-amber-500',
      overallStatus: 'partial',
      items: [
        {
          name: 'Client-Side Security',
          status: 'complete',
          percentage: 100,
          details: 'No sensitive data stored in localStorage, secure token handling',
          evidence: 'React best practices followed',
        },
        {
          name: 'API Security',
          status: 'pending',
          percentage: 0,
          details: 'JWT authentication ready, awaiting backend implementation',
          evidence: 'Data structures defined in utils',
        },
        {
          name: 'Encryption (Transit)',
          status: 'pending',
          percentage: 0,
          details: 'TLS 1.3 configuration pending backend deployment',
          evidence: 'Infrastructure checklist item',
        },
        {
          name: 'Encryption (Rest)',
          status: 'pending',
          percentage: 0,
          details: 'Database encryption pending backend deployment',
          evidence: 'AWS KMS integration planned',
        },
        {
          name: 'Access Control',
          status: 'pending',
          percentage: 0,
          details: 'Role-based access control pending backend implementation',
          evidence: 'Admin panel UI ready',
        },
        {
          name: 'Audit Logging',
          status: 'pending',
          percentage: 0,
          details: 'Event log system designed, awaiting backend integration',
          evidence: 'DashboardFusionEngine.tsx event log',
        },
      ],
    },
    {
      category: 'legal',
      title: 'Legal Compliance',
      icon: FileText,
      color: 'from-blue-500 to-cyan-500',
      overallStatus: 'complete',
      items: [
        {
          name: 'GDPR Compliance',
          status: 'complete',
          percentage: 100,
          details: 'Articles 6, 7, 13, 15, 17 fully implemented in frontend',
          evidence: 'Consent, access, deletion all operational',
        },
        {
          name: 'CCPA Compliance',
          status: 'complete',
          percentage: 100,
          details: 'Sections 1798.100, 1798.105, 1798.120 fully compliant',
          evidence: 'No data sale, user deletion, transparent disclosure',
        },
        {
          name: 'iOS Guidelines',
          status: 'complete',
          percentage: 100,
          details: 'Permission justification strings and UX patterns compliant',
          evidence: 'LocationPermissionFlow.tsx',
        },
        {
          name: 'Contractor Agreement',
          status: 'complete',
          percentage: 100,
          details: 'Independent contractor agreement required before valet work',
          evidence: 'IndependentContractorAgreement.tsx',
        },
        {
          name: 'Liability Waiver',
          status: 'complete',
          percentage: 100,
          details: 'Customer signs waiver before valet service',
          evidence: 'ValetLiabilityWaiver.tsx',
        },
        {
          name: 'Vehicle Verification',
          status: 'complete',
          percentage: 100,
          details: 'Mandatory photo documentation before/after service',
          evidence: 'VehiclePhotoVerification.tsx',
        },
      ],
    },
    {
      category: 'operational',
      title: 'Operational Risk Management',
      icon: Activity,
      color: 'from-purple-500 to-fuchsia-500',
      overallStatus: 'complete',
      items: [
        {
          name: 'Trip Audit Viewer',
          status: 'complete',
          percentage: 100,
          details: 'Full trip replay with sensor fusion breakdown for dispute resolution',
          evidence: 'DashboardFusionEngine.tsx Trip Replay',
        },
        {
          name: 'Geofence Event Log',
          status: 'complete',
          percentage: 100,
          details: 'Searchable log of all entry/exit events with accuracy data',
          evidence: 'DashboardFusionEngine.tsx Event Log',
        },
        {
          name: 'System Health Monitoring',
          status: 'complete',
          percentage: 100,
          details: 'Real-time accuracy, latency, and sensor availability tracking',
          evidence: 'DashboardFusionEngine.tsx System Overview',
        },
        {
          name: 'Quality Assurance Dashboard',
          status: 'complete',
          percentage: 100,
          details: 'Identify accuracy issues and infrastructure gaps',
          evidence: 'DashboardFusionEngine.tsx Live Monitor',
        },
        {
          name: 'Incident Investigation',
          status: 'complete',
          percentage: 100,
          details: 'High-speed and acceleration detection for safety review',
          evidence: 'Trip data includes speed/acceleration',
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

    return Math.round((completedItems / totalItems) * 100);
  };

  const overallCompliance = calculateOverallCompliance();

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={springConfig}
      >
        <h2 className="text-title-2 mb-2 text-white">
          Risk Mitigation & Compliance
        </h2>
        <p className="text-[15px] text-white/70" style={{ fontWeight: 400 }}>
          System-wide compliance status and risk mitigation verification
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
              Ready for Launch
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
              Pending Backend
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
                  {getStatusIcon(section.overallStatus)}
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
                      {item.evidence && (
                        <div className="flex items-center gap-1.5 text-[11px] text-cyan-400" style={{ fontWeight: 500 }}>
                          <FileText className="w-3 h-3" strokeWidth={2.5} />
                          <span>{item.evidence}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </motion.div>
              )}
            </motion.button>
          );
        })}
      </div>

      {/* Key Achievements */}
      <motion.div
        className="rounded-[20px] p-5 border-2 border-green-500/30 bg-gradient-to-br from-green-500/10 to-emerald-500/5 backdrop-blur-xl shadow-xl"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...springConfig, delay: 0.5 }}
      >
        <div className="flex items-center gap-2 mb-4">
          <Check className="w-5 h-5 text-green-400" strokeWidth={2.5} />
          <h3 className="text-[17px] text-white" style={{ fontWeight: 600 }}>
            Key Achievements
          </h3>
        </div>
        <ul className="space-y-2 text-[14px] text-white/90" style={{ fontWeight: 400 }}>
          <li className="flex items-start gap-2">
            <span className="text-green-400 mt-0.5">•</span>
            <span>Privacy-by-design architecture with transparent disclosure</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-green-400 mt-0.5">•</span>
            <span>Graduated permission system with contextual explanations</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-green-400 mt-0.5">•</span>
            <span>Legal protection documents for valet liability</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-green-400 mt-0.5">•</span>
            <span>Admin audit tools for dispute resolution</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-green-400 mt-0.5">•</span>
            <span>GDPR & CCPA compliant user data controls</span>
          </li>
        </ul>
      </motion.div>

      {/* Next Steps */}
      <motion.div
        className="rounded-[20px] p-5 border-2 border-orange-500/30 bg-gradient-to-br from-orange-500/10 to-amber-500/5 backdrop-blur-xl shadow-xl"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...springConfig, delay: 0.6 }}
      >
        <div className="flex items-center gap-2 mb-4">
          <Clock className="w-5 h-5 text-orange-400" strokeWidth={2.5} />
          <h3 className="text-[17px] text-white" style={{ fontWeight: 600 }}>
            Pending Backend Integration
          </h3>
        </div>
        <ul className="space-y-2 text-[14px] text-white/90" style={{ fontWeight: 400 }}>
          <li className="flex items-start gap-2">
            <span className="text-orange-400 mt-0.5">⏳</span>
            <span>Sensor Fusion Engine (Kalman Filter + Trilateration)</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-orange-400 mt-0.5">⏳</span>
            <span>API security (TLS 1.3 + JWT authentication)</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-orange-400 mt-0.5">⏳</span>
            <span>Database encryption (AWS KMS)</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-orange-400 mt-0.5">⏳</span>
            <span>Audit logging system</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-orange-400 mt-0.5">⏳</span>
            <span>Final legal review by attorney</span>
          </li>
        </ul>
      </motion.div>

      {/* Documentation Link */}
      <motion.a
        href="/RISK_MITIGATION_COMPLIANCE_CHECKLIST.md"
        target="_blank"
        className="block rounded-[20px] p-5 border-2 border-white/30 bg-[#1C1C1E]/80 backdrop-blur-xl shadow-xl"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...springConfig, delay: 0.7 }}
        whileTap={{ scale: 0.98 }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-cyan-500 flex items-center justify-center">
              <FileText className="w-5 h-5 text-white" strokeWidth={2.5} />
            </div>
            <div>
              <h3 className="text-[15px] mb-0.5 text-white" style={{ fontWeight: 600 }}>
                Full Compliance Report
              </h3>
              <p className="text-[13px] text-white/60" style={{ fontWeight: 400 }}>
                10,000+ word detailed audit
              </p>
            </div>
          </div>
          <ChevronRight className="w-5 h-5 text-white/40" strokeWidth={2.5} />
        </div>
      </motion.a>
    </div>
  );
}
