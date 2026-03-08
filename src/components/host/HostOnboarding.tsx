import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { providerApi } from '../../utils/api';
import { toast } from 'sonner@2.0.3';
import { Step1AccountCreation } from './onboarding/Step1AccountCreation';
import { Step2HostType } from './onboarding/Step2HostType';
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
  
  // Step 2: Host Type
  hostType?: 'venue' | 'parking' | 'valet';
  
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
    bankAccount: {
      accountHolder: string;
      routingNumber: string;
      accountNumber: string;
      accountType: 'checking' | 'savings';
    };
    schedule: 'weekly' | 'monthly';
  };
}

interface HostOnboardingProps {
  isDarkMode: boolean;
  onComplete: () => void;
}

export function HostOnboarding({ isDarkMode, onComplete }: HostOnboardingProps) {
  const [currentStep, setCurrentStep] = useState(1);
  const [onboardingData, setOnboardingData] = useState<OnboardingData>({});

  const totalSteps = 10;

  // Load saved progress from API on mount
  useEffect(() => {
    providerApi.getStatus().then((res) => {
      if (res.success && res.data?.host?.onboardingData) {
        const { currentStep, onboardingData: saved } = res.data.host;
        setOnboardingData((saved as OnboardingData) || {});
        // Resume from saved step only if still in draft
        if (res.data.host.status === 'draft' && currentStep > 1) {
          setCurrentStep(currentStep);
        }
      }
    });
  }, []);

  // Save progress to API (fire-and-forget — we don't block the UI)
  const saveProgress = (step: number, data: Partial<OnboardingData>) => {
    const updatedData = { ...onboardingData, ...data };
    setOnboardingData(updatedData);
    providerApi.saveHostProgress(step, updatedData as Record<string, unknown>).catch(() => {
      // Silently ignore network errors during draft saves
    });
  };

  const handleStepComplete = (data: Partial<OnboardingData>) => {
    const nextStep = currentStep + 1;
    saveProgress(nextStep, data);
    
    if (nextStep <= totalSteps) {
      setCurrentStep(nextStep);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSubmit = async () => {
    const res = await providerApi.submitHostApplication();
    if (res.success) {
      setCurrentStep(10); // Go to completion screen
    } else {
      toast.error('Submission failed', {
        description: res.error?.message || 'Please try again.',
        duration: 4000,
      });
    }
  };

  return (
    <div className="min-h-screen pt-20 pb-24">
      {/* Progress Bar */}
      <div className="px-8 mb-8">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[13px] text-white/80" style={{ fontWeight: 600 }}>
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
          <Step2HostType
            onComplete={handleStepComplete}
            initialValue={onboardingData.hostType}
          />
        )}
        
        {currentStep === 3 && (
          <Step3BusinessInfo
            onComplete={handleStepComplete}
            initialValue={onboardingData.businessInfo}
            hostType={onboardingData.hostType}
          />
        )}
        
        {currentStep === 4 && (
          <Step4ListingDetails
            onComplete={handleStepComplete}
            initialValue={onboardingData.listing}
            hostType={onboardingData.hostType}
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
            hostType={onboardingData.hostType}
          />
        )}
        
        {currentStep === 8 && (
          <Step8PayoutSetup
            onComplete={handleStepComplete}
            initialValue={onboardingData.payout}
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
