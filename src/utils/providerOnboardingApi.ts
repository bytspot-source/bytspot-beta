import { trpc } from './trpc';

export function saveProviderProgress(currentStep: number, onboardingData: Record<string, unknown>) {
  return trpc.providers.saveHostProgress.mutate({ currentStep, onboardingData });
}

export function submitProviderApplication() {
  return trpc.providers.submitHostApplication.mutate();
}
