// Public surface of the Provider shell, which is the vendor experience embedded
// in the consumer app. The standalone console lives in src/vendor and shares
// nothing with this tree beyond the contracts under contracts/.
// dashboard/ and onboarding/ subdirectories are internal.
export { ProviderApp } from './ProviderApp';
export { ProviderLanding } from './ProviderLanding';
export { ProviderOnboarding, type OnboardingData, type ProviderType } from './ProviderOnboarding';
