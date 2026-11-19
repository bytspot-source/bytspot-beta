/**
 * Refunds — a stable URL for the App Store and Stripe.
 * Accessible at /refunds (no auth required). Same policy as Terms section 3.
 * Last updated: 2026-11-19
 */
import { RefundPolicyList } from './TermsOfService';

export function Refunds() {
  return (
    <div className="min-h-screen bg-black text-white/90 px-6 py-12 max-w-2xl mx-auto leading-relaxed">
      <h1 className="text-3xl font-bold mb-2">Refunds</h1>
      <p className="text-white/50 text-sm mb-8">Last updated: November 19, 2026</p>

      <p className="mb-6">
        Passes bought in the Bytspot app are covered by the policy below. The app is operated by
        Bytspot Inc., a Delaware corporation. This is the same policy as section 3 of the{' '}
        <a href="/terms#refunds" className="text-blue-400 underline">Terms of Service</a>.
      </p>

      <section className="mb-8">
        <h2 className="text-lg font-semibold text-white mb-3">Passes, payments, and refunds</h2>
        <div className="text-[15px] text-white/75">
          <RefundPolicyList />
        </div>
      </section>

      <p className="mb-6">
        Questions about a refund? Email{' '}
        <a href="mailto:bytspotapp@gmail.com" className="text-blue-400 underline">bytspotapp@gmail.com</a>.
        Mailing address: Bytspot Inc., 8735 Dunwoody Place #13893, Atlanta, GA 30350, USA.
      </p>

      <p>
        <a href="/terms" className="text-blue-400 underline">Read the full Terms of Service</a>
      </p>

      <div className="mt-12 pt-6 border-t border-white/10 text-white/40 text-xs text-center">
        © {new Date().getFullYear()} Bytspot Inc. All rights reserved.
      </div>
    </div>
  );
}
