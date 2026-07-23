import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { trpc } from '../../utils/trpc';
import { toast } from 'sonner';
import { evaluateProviderApplication, persistProviderReviewState } from '../../utils/providerApproval';
import { saveProviderProgress, submitProviderApplication } from '../../utils/providerOnboardingApi';
import { isProviderStripeConnectPath, syncProviderStripeConnectReturn } from '../../utils/providerStripeConnectReturn';
import { resolveBlackInvite, type BlackInviteRecord } from '../../utils/blackInvite';
import { Step1AccountCreation } from './onboarding/Step1AccountCreation';
import { Step2ProviderType } from './onboarding/Step2ProviderType';
import { Step3BusinessInfo } from './onboarding/Step3BusinessInfo';
import { Step4ListingDetails } from './onboarding/Step4ListingDetails';
import { Step5PricingSetup } from './onboarding/Step5PricingSetup';
import { Step6Availability } from './onboarding/Step6Availability';
import { Step7Verification } from './onboarding/Step7Verification';
import { Step8PayoutSetup } from './onboarding/Step8PayoutSetup';
import { Step9ReviewSubmit } from './onboarding/Step9ReviewSubmit';
import { Step10Complete } from './onboarding/Step10Complete';

export interface OnboardingData {
  // Step 1: Account
  account?: {
    email: string;
    phone: string;
    password: string;
  };
  
  // Step 2: Provider Type
  providerType?: ProviderType;
  /** @deprecated Legacy saved-draft key. Use providerType for new code. */
  hostType?: ProviderOnboardingType;

  // Stealth Black-tier invite (set when ?invite=BLACK-XXXX is accepted).
  blackInvite?: {
    code: string;
    acceptedAt: string;
    tier: 'black';
  };
  
  // Step 3: Business Info
  businessInfo?: {
    legalName?: string;
    contactName: string;
    contactTitle?: string;
    address: {
      street: string;
      city: string;
      state: string;
      zipCode: string;
    };
    taxId?: string;
    businessLicense?: string;
    numberOfSpots: number;
    facilityType?: string;
  };

  // Optional Compliance Hub preference
  compliance?: {
    checklistPreference: 'review_now' | 'skip_for_now';
    region: 'GA';
  };
  
  // Step 4: Listing
  listing?: {
    location: {
      address: string;
      coordinates: { lat: number; lng: number };
      notes: string;
    };
    spotType: 'outdoor' | 'covered' | 'garage' | 'valet';
    accessType: 'self' | 'valet' | 'key_exchange';
    size: 'compact' | 'standard' | 'large' | 'oversized';
    photos: string[];
    amenities: {
      evCharging?: 'level1' | 'level2' | 'dcfast';
      covered: boolean;
      security: boolean;
      gated: boolean;
      access24: boolean;
      restroom: boolean;
      attendant: boolean;
      accessible: boolean;
    };
  };
  
  // Step 5: Pricing
  pricing?: {
    hourly: number;
    daily?: number;
    monthly?: number;
    dynamicPricing: {
      enabled: boolean;
      surgePricing: boolean;
      weekendAdjustment?: number;
    };
  };
  
  // Step 6: Availability
  availability?: {
    schedule: {
      [key: string]: { start: string; end: string }[];
    };
    blockedDates: string[];
    rules: {
      minBooking: number;
      maxBooking: number;
      advanceNotice: number;
      cancellationPolicy: 'flexible' | 'moderate' | 'strict';
    };
  };
  
  // Step 7: Verification
  verification?: {
    identity: {
      idType: string;
      idPhotos: { front: string; back?: string };
    };
    business?: {
      licensePhoto?: string;
      insurancePhoto?: string;
    };
  };
  
  // Step 8: Payout
  payout?: {
    stripeConnect?: {
      displayName: string;
      onboardingStarted: boolean;
      accountId?: string;
      status: 'pending' | 'active';
    };
    bankAccount: {
      accountHolder: string;
      routingNumber: string;
      accountNumber: string;
      accountType: 'checking' | 'savings';
    };
    schedule: 'weekly' | 'monthly';
  };
}

export type ProviderType = 'venue' | 'parking' | 'event' | 'valet';
export type ProviderOnboardingType = ProviderType;

const providerRoleToProviderType: Record<string, ProviderType> = {
  parking: 'parking',
  venue: 'venue',
  event: 'event',
  service: 'valet',
};

function getProviderType(data: Partial<OnboardingData> = {}) {
  return data.providerType ?? data.hostType;
}

function normalizeProviderOnboardingData(data: Partial<OnboardingData> = {}): OnboardingData {
  const providerType = getProviderType(data);
  return providerType ? { ...data, providerType, hostType: providerType } as OnboardingData : { ...data } as OnboardingData;
}

function getInitialOnboardingData(): OnboardingData {
  if (typeof window === 'undefined') return {};
  const selectedRole = localStorage.getItem('bytspot_provider_role') || '';
  const providerType = providerRoleToProviderType[selectedRole];
  const base: OnboardingData = providerType ? normalizeProviderOnboardingData({ providerType }) : {};
  const invite = resolveBlackInvite();
  return applyBlackInvite(base, invite);
}

/** Merge an accepted Black invite into the onboarding draft (default operational shape: venue). */
function applyBlackInvite(data: OnboardingData, invite: BlackInviteRecord | null): OnboardingData {
  if (!invite) return data;
  const providerType = data.providerType ?? 'venue';
  return {
    ...data,
    providerType,
    hostType: providerType,
    blackInvite: { code: invite.code, acceptedAt: invite.acceptedAt, tier: 'black' },
  };
}

interface ProviderOnboardingProps {
  isDarkMode: boolean;
  onComplete: () => void;
}

export function ProviderOnboarding({ isDarkMode, onComplete }: ProviderOnboardingProps) {
  const [currentStep, setCurrentStep] = useState(1);
  const [onboardingData, setOnboardingData] = useState<OnboardingData>(() => getInitialOnboardingData());

  const totalSteps = 10;

  // Load saved progress from API on mount
  useEffect(() => {
    let cancelled = false;
    const loadProgress = async () => {
      const res = await trpc.providers.getStatus.query();
      if (!res?.host?.onboardingData || cancelled) return;

      const savedStep = Number(res.host.currentStep ?? 1);
      let nextStep = res.host.status === 'draft' && savedStep > 1 ? savedStep : 1;
      let nextData = normalizeProviderOnboardingData({ ...getInitialOnboardingData(), ...((res.host.onboardingData as OnboardingData) || {}) });
      // Re-apply the invite after merging server-side draft so the gate survives refreshes.
      nextData = applyBlackInvite(nextData, resolveBlackInvite());

      if (isProviderStripeConnectPath()) {
        const synced = await syncProviderStripeConnectReturn(nextData as Record<string, unknown>, nextStep);
        nextData = normalizeProviderOnboardingData(synced.onboardingData as OnboardingData);
        nextStep = synced.currentStep;
        if (synced.payoutUpdated) {
          saveProviderProgress(nextStep, normalizeProviderOnboardingData(nextData) as Record<string, unknown>).catch(() => {
            // Dashboard/onboarding can retry on the next refresh.
          });
        }
      }

      if (!cancelled) {
        setOnboardingData(nextData);
        setCurrentStep(nextStep);
      }
    };
    loadProgress().catch(() => {
      // Leave the user on the current local onboarding step if saved progress cannot load.
    });
    return () => { cancelled = true; };
  }, []);

  // Save progress to API (fire-and-forget — we don't block the UI)
  const saveProgress = (step: number, data: Partial<OnboardingData>) => {
    const updatedData = normalizeProviderOnboardingData({ ...onboardingData, ...data });
    setOnboardingData(updatedData);
    const providerType = getProviderType(updatedData);
    if (providerType) localStorage.setItem('bytspot_provider_selected_type', providerType);
    if (updatedData.businessInfo?.legalName || updatedData.businessInfo?.contactName) {
      localStorage.setItem('bytspot_provider_business_name', updatedData.businessInfo.legalName || updatedData.businessInfo.contactName);
    }
    saveProviderProgress(step, normalizeProviderOnboardingData(updatedData) as Record<string, unknown>).catch(() => {
      // Silently ignore network errors during draft saves
    });
  };

  const handleStepComplete = (data: Partial<OnboardingData>) => {
    let nextStep = currentStep + 1;
    // Stealth Black flow: Step 2 (public provider-type picker) is skipped — providerType is pre-set.
    if (nextStep === 2 && onboardingData.blackInvite) {
      nextStep = 3;
    }
    saveProgress(nextStep, data);

    if (nextStep <= totalSteps) {
      setCurrentStep(nextStep);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      // Skip Step 2 on the way back too, so Black providers never see the public picker.
      const prevStep = currentStep === 3 && onboardingData.blackInvite ? 1 : currentStep - 1;
      setCurrentStep(prevStep);
    }
  };

  const handleSubmit = async () => {
    const reviewState = evaluateProviderApplication(onboardingData);
    persistProviderReviewState(reviewState);

    try {
      await submitProviderApplication();
      setCurrentStep(10); // Go to completion screen
    } catch (err: any) {
      toast.error('Submission failed', {
        description: err?.message || 'Please try again.',
        duration: 4000,
      });
    }
  };

  const providerType = getProviderType(onboardingData);
  const blackInvite = onboardingData.blackInvite;

  return (
    <div data-testid="provider-onboarding-root" data-current-step={currentStep} data-black-invite={blackInvite ? 'accepted' : undefined} className="min-h-screen pt-20 pb-24">
      {blackInvite && (
        <div data-testid="provider-onboarding-black-badge" className="px-8 mb-4">
          <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-white/20 bg-black/60 px-3.5 py-1.5 text-[11px] uppercase tracking-[0.2em] text-white/90 backdrop-blur-xl" style={{ fontWeight: 700 }}>
            <span className="h-1.5 w-1.5 rounded-full bg-white" />
            Bytspot Black · Invite Accepted
          </div>
        </div>
      )}
      {/* Progress Bar */}
      <div className="px-8 mb-8">
        <div className="flex items-center justify-between mb-3">
          <span data-testid="provider-onboarding-progress" className="text-[13px] text-white/80" style={{ fontWeight: 600 }}>
            Step {currentStep} of {totalSteps}
          </span>
          <span className="text-[13px] text-white/60" style={{ fontWeight: 500 }}>
            {Math.round((currentStep / totalSteps) * 100)}% Complete
          </span>
        </div>
        
        {/* Progress Pills */}
        <div className="flex gap-1.5">
          {Array.from({ length: totalSteps }).map((_, index) => (
            <motion.div
              key={index}
              className={`h-1.5 rounded-full flex-1 ${
                index < currentStep
                  ? 'bg-gradient-to-r from-purple-500 to-cyan-500'
                  : 'bg-white/20'
              }`}
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ delay: index * 0.05 }}
            />
          ))}
        </div>
      </div>

      {/* Step Content */}
      <div className="px-4">
        {currentStep === 1 && (
          <Step1AccountCreation
            onComplete={handleStepComplete}
            initialValue={onboardingData.account}
          />
        )}
        
        {currentStep === 2 && (
          <Step2ProviderType
            onComplete={handleStepComplete}
            initialValue={providerType}
          />
        )}
        
        {currentStep === 3 && (
          <Step3BusinessInfo
            onComplete={handleStepComplete}
            initialValue={onboardingData.businessInfo}
            initialCompliance={onboardingData.compliance}
            providerType={providerType}
          />
        )}
        
        {currentStep === 4 && (
          <Step4ListingDetails
            onComplete={handleStepComplete}
            initialValue={onboardingData.listing}
            providerType={providerType}
          />
        )}
        
        {currentStep === 5 && (
          <Step5PricingSetup
            onComplete={handleStepComplete}
            initialValue={onboardingData.pricing}
            listing={onboardingData.listing}
          />
        )}
        
        {currentStep === 6 && (
          <Step6Availability
            onComplete={handleStepComplete}
            initialValue={onboardingData.availability}
          />
        )}
        
        {currentStep === 7 && (
          <Step7Verification
            onComplete={handleStepComplete}
            initialValue={onboardingData.verification}
            providerType={providerType}
          />
        )}
        
        {currentStep === 8 && (
          <Step8PayoutSetup
            onComplete={handleStepComplete}
            initialValue={onboardingData.payout}
            businessName={onboardingData.businessInfo?.legalName || onboardingData.businessInfo?.contactName || onboardingData.account?.email}
          />
        )}
        
        {currentStep === 9 && (
          <Step9ReviewSubmit
            onComplete={handleSubmit}
            data={onboardingData}
            onEdit={(step) => setCurrentStep(step)}
          />
        )}
        
        {currentStep === 10 && (
          <Step10Complete
            onComplete={onComplete}
            data={onboardingData}
          />
        )}
      </div>

      {/* Back Button (not on first or last step) */}
      {currentStep > 1 && currentStep < 10 && (
        <div className="px-8 mt-6">
          <motion.button
            onClick={handleBack}
            data-testid="provider-onboarding-back"
            className="w-full py-3 rounded-full border-2 border-white/30 bg-[#1C1C1E]/80 backdrop-blur-xl text-white"
            whileTap={{ scale: 0.98 }}
          >
            <span className="text-[15px]" style={{ fontWeight: 600 }}>
              Back
            </span>
          </motion.button>
        </div>
      )}
    </div>
  );
}
