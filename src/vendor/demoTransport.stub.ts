import type { AuthTransport } from './auth.ts';
import type { Seller } from './seller.ts';
import type { DemandTransport } from './demandTransport.ts';
import type { SetupTransport } from './setupTransport.ts';

/**
 * What the default vendor build compiles against. The real demo transport is
 * swapped in by vite.vendor.config.ts only under --mode vendor-demo, so a
 * production bundle contains this file instead and therefore contains no
 * sign-in bypass and none of the seeded businesses.
 *
 * Relying on tree-shaking was not enough: the seeded names survived into
 * dist-vendor even with the flag folded to false, which is why the substitution
 * happens at resolution time rather than in the optimiser.
 */
export const VENDOR_DEMO_MODE = false;

export function demoAuthTransport(): AuthTransport {
  throw new Error('the demo transport is not part of this build');
}

export function demoSetupTransport(_opened?: Seller): SetupTransport {
  throw new Error('the demo transport is not part of this build');
}

export function demoDemandTransport(_opened?: Seller): DemandTransport {
  throw new Error('the demo transport is not part of this build');
}
