/**
 * Privacy Policy — required for App Store submission.
 * Accessible at /privacy (no auth required).
 * Must match ios/App/App/PrivacyInfo.xcprivacy and the App Store privacy labels.
 * Last updated: 2026-11-11
 */
export function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-black text-white/90 px-6 py-12 max-w-2xl mx-auto leading-relaxed">
      <h1 className="text-3xl font-bold mb-2">Privacy Policy</h1>
      <p className="text-white/50 text-sm mb-8">Last updated: November 11, 2026</p>

      <p className="mb-6">
        Bytspot ("we", "us", or "our") operates the Bytspot iPhone app and App Clip (the "App").
        This policy explains what we collect, why, who we share it with, and the choices you have.
      </p>

      <Section title="1. Information We Collect">
        <BulletList items={[
          <><B>Account information</B> — Your name, email address, and, if you add them, phone number, birthday, and profile photo. If you sign in with Apple or Google, we receive the name and email they share with us.</>,
          <><B>Location</B> — Only while the App is open. We use it to show places nearby, verify a check-in (your distance from the venue is recorded with the check-in), place reports you submit on the Map, and set Plan meet-up points. Plan members who did not create the Plan see only an area of about 500 m. We do not track your location in the background.</>,
          <><B>Contacts (as one-way codes)</B> — If you allow it, your phone turns the phone numbers and email addresses in your contacts into one-way codes and sends only those codes, to find friends already on Bytspot. Contact names and other details stay on your phone.</>,
          <><B>Payments and purchases</B> — When you buy a party pass or ticket, or save a card, payment is handled by Stripe. We receive the card brand, last four digits, expiry, and your purchase history. We never see or store full card numbers. Hosts who are paid through Bytspot provide payout details to Stripe.</>,
          <><B>Content you create</B> — Plans, parties, Private Sale listings, reviews, photos, reports, and messages you send in the App.</>,
          <><B>Check-ins and points</B> — Where and when you check in, and the points you earn.</>,
          <><B>Concierge and voice</B> — Questions you ask the AI Concierge. If you use voice input, your speech is converted to text and used the same way as a typed request.</>,
          <><B>Device and app activity</B> — Your push notification token if you turn on notifications, how you use features, and crash and error reports.</>,
        ]} />
      </Section>

      <Section title="2. How We Use Your Information">
        <BulletList items={[
          'Run your account and the features you use: places, Plans, parties, passes, Private Sales, check-ins, and points.',
          'Process payments, refunds, and host payouts.',
          'Find friends who are already on Bytspot.',
          'Send notifications you turned on, such as party updates and reminders.',
          'Personalize recommendations.',
          'Keep the App safe: review reports, prevent fraud and abuse, and enforce our Terms.',
          'Fix bugs and improve the App.',
        ]} />
      </Section>

      <Section title="3. Who Can See What">
        <BulletList items={[
          'Plan members see what you share in the Plan. The exact meet-up point is shown only to the Plan creator.',
          'Party guests see the exact venue only after they are approved or have bought a pass, unless the host makes it public.',
          'Private Sale buyers see only what the seller chooses to share, such as a meet point or payment handle, after the seller approves them.',
          'Businesses see counts of check-ins at their places, not who checked in.',
        ]} />
      </Section>

      <Section title="4. Service Providers">
        <p className="mb-3">We share information only with providers that help us run the App:</p>
        <BulletList items={[
          <><B>Stripe</B> — payments, saved cards, refunds, and host payouts.</>,
          <><B>OpenAI</B> — AI Concierge answers. Your question and venue information are sent; your contacts and location history are not.</>,
          <><B>Google</B> — place details and photos, and Google sign-in if you use it.</>,
          <><B>Apple</B> — Sign in with Apple and push notifications.</>,
          <><B>Resend</B> — sign-in codes and account email.</>,
          <><B>Sentry</B> — crash and error reports.</>,
          <><B>Render</B> and <B>Cloudflare</B> — hosting, storage, and network security.</>,
        ]} />
        <p className="mt-3">We do not sell your personal information, and we do not use it to track you across other companies' apps or websites.</p>
      </Section>

      <Section title="5. Storage and Security">
        <p>
          Your account data is stored on our servers and sent over encrypted connections (TLS).
          Contacts are sent only as keyed one-way codes. We limit who on our team can access data
          and rate-limit lookups. No system is perfectly secure.
        </p>
      </Section>

      <Section title="6. Your Choices">
        <BulletList items={[
          <><B>Delete your account</B> in the App: Profile, then Safety & Legal, then Delete Account. You are signed out right away and your account is permanently erased after 30 days. Signing in again within 30 days cancels the deletion. We may keep records we must keep for payments, tax, disputes, or legal reasons.</>,
          'Turn location, contacts, camera, photos, microphone, and notification permissions on or off at any time in iOS Settings.',
          'Edit your profile and notification preferences in the App.',
          <>Ask us for a copy of your data, or for a correction, by emailing <a href="mailto:bytspotapp@gmail.com" className="text-blue-400 underline">bytspotapp@gmail.com</a>.</>,
        ]} />
      </Section>

      <Section title="7. Children">
        <p>
          Bytspot is not meant for children under 13, and we do not knowingly collect their information.
          Parties with alcohol are for guests 21 and older. If we learn an account belongs to a child under 13, we remove it.
        </p>
      </Section>

      <Section title="8. Changes to This Policy">
        <p>
          We may update this policy. We will post the new version here, update the date above, and tell you in the App
          if the change is significant.
        </p>
      </Section>

      <Section title="9. Contact Us">
        <p>
          Questions about this policy or a safety concern:{' '}
          <a href="mailto:bytspotapp@gmail.com" className="text-blue-400 underline">bytspotapp@gmail.com</a>.
        </p>
      </Section>

      <div className="mt-12 pt-6 border-t border-white/10 text-white/40 text-xs text-center">
        © {new Date().getFullYear()} Bytspot. All rights reserved.
      </div>
    </div>
  );
}

/* ── Helpers ── */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="text-lg font-semibold text-white mb-3">{title}</h2>
      <div className="text-[15px] text-white/75">{children}</div>
    </section>
  );
}

function B({ children }: { children: React.ReactNode }) {
  return <strong className="text-white/90">{children}</strong>;
}

function BulletList({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="list-disc list-outside pl-5 space-y-2">
      {items.map((item, i) => <li key={i}>{item}</li>)}
    </ul>
  );
}
