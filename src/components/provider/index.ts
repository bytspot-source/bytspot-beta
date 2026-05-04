// Public surface of the Provider shell.
// Phase 3 boundary: anything imported from this package by App.tsx or
// other shells must be re-exported here. Internal helpers stay private.
export { ProviderLanding, type ProviderRole } from './ProviderLanding';
export { ProviderPremiumGate } from './ProviderPremiumGate';
export { ProviderInstallPrompt } from './ProviderInstallPrompt';
