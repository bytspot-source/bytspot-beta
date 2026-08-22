/**
 * Support — contact and help routes for members, hosts, and App Review.
 * Accessible at /support (no auth required).
 * Last updated: 2026-08-21
 */
const SUPPORT_EMAIL = 'bytspotapp@gmail.com';

export function Support() {
  return (
    <div className="min-h-screen bg-black text-white/90 px-6 py-12 max-w-2xl mx-auto leading-relaxed">
      <h1 className="text-3xl font-bold mb-2">Support</h1>
      <p className="text-white/50 text-sm mb-8">We read every message.</p>

      <p className="mb-6">
        Email{' '}
        <a className="text-cyan-400 underline" href={`mailto:${SUPPORT_EMAIL}`}>
          {SUPPORT_EMAIL}
        </a>{' '}
        and we will get back to you as soon as we can. Include your account
        email and, if the question is about a specific party, its invitation
        link. Never send us your password or payment details — we will never
        ask for them.
      </p>

      <Section title="Your account">
        <p className="mb-3">
          You can delete your account inside the app: open <strong>Profile</strong>,
          then <strong>Safety &amp; Legal</strong>, then <strong>Delete Account</strong>.
          Deletion is immediate from your side — you are signed out and your
          session ends.
        </p>
        <p className="mb-3">
          Your record is held for 30 days before it is erased permanently. Signing
          in again during those 30 days cancels the deletion and restores your
          account, and the app tells you when that has happened. After 30 days the
          record is gone and cannot be recovered.
        </p>
        <p className="mb-3">
          If you cannot reach the app, email us from the address on the account
          and we will handle the deletion once we have confirmed the account
          belongs to you.
        </p>
      </Section>

      <Section title="Party passes and invitations">
        <p className="mb-3">
          An invitation link stops working once the party it belongs to has ended.
          If you already hold a pass to that party, it stays in the app.
        </p>
        <p className="mb-3">
          If a link will not open, ask the host to confirm the party is still
          published and to re-share it. Hosts can change how long a link lasts from
          Party Control.
        </p>
      </Section>

      <Section title="Hosting">
        <p className="mb-3">
          Questions about publishing a party, your guest list, admissions, or
          ticketing go to the same address. Tell us the party name and roughly when
          it was published so we can find it.
        </p>
      </Section>

      <Section title="Privacy and data">
        <p className="mb-3">
          To request a copy of your data, or to ask what we hold, email us from the
          address on your account.
        </p>
        <p className="mb-3">
          See our <a className="text-cyan-400 underline" href="/privacy">Privacy Policy</a>,{' '}
          <a className="text-cyan-400 underline" href="/terms">Terms of Service</a>, and{' '}
          <a className="text-cyan-400 underline" href="/disclaimer">Disclaimer</a>.
        </p>
      </Section>

      <Section title="Reporting something urgent">
        <p className="mb-3">
          Bytspot is not an emergency service. If someone is in danger, contact your
          local emergency number first. To report abuse, a safety concern at a
          party, or a security issue in the app, email us with{' '}
          <strong>URGENT</strong> in the subject line.
        </p>
      </Section>

      <div className="mt-12 pt-6 border-t border-white/10 text-white/40 text-xs">
        <p>© {new Date().getFullYear()} Bytspot. All rights reserved.</p>
        <p className="mt-1">
          Contact us at{' '}
          <a className="text-cyan-400 underline" href={`mailto:${SUPPORT_EMAIL}`}>
            {SUPPORT_EMAIL}
          </a>
        </p>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="text-lg font-semibold text-cyan-400 mb-3">{title}</h2>
      <div className="text-white/70 text-[15px]">{children}</div>
    </section>
  );
}
