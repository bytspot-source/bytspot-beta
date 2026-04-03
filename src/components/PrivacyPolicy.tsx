/**
 * Privacy Policy — required for App Store & Play Store submission.
 * Accessible at /privacy (no auth required).
 * Last updated: 2026-04-03
 */
export function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-black text-white/90 px-6 py-12 max-w-2xl mx-auto leading-relaxed">
      <h1 className="text-3xl font-bold mb-2">Privacy Policy</h1>
      <p className="text-white/50 text-sm mb-8">Last updated: April 3, 2026</p>

      <p className="mb-6">
        Bytspot ("we", "us", or "our") operates the Bytspot mobile application (the "App").
        This page informs you of our policies regarding the collection, use, and disclosure
        of personal data when you use our App.
      </p>

      <Section title="1. Information We Collect">
        <BulletList items={[
          <><B>Account Information</B> — Email address, name, and password when you create an account.</>,
          <><B>Location Data (When In Use)</B> — We access your device's location <em>only while the App is open</em> to show nearby venues, live crowd levels, and parking availability. We never track your location in the background.</>,
          <><B>Usage Data</B> — Category clicks, venue visits, and search queries stored locally on your device to personalize recommendations. This data is not sent to our servers unless you are signed in.</>,
          <><B>Push Notification Tokens</B> — If you opt in to notifications, we store your device token to send crowd alerts for your saved venues.</>,
          <><B>Camera & Photos</B> — Accessed only when you choose to create a post or update your profile picture. We do not access your camera or photo library without your explicit action.</>,
          <><B>Preferences & Quiz Answers</B> — Vibe preferences, cuisine affinities, and onboarding quiz answers stored locally to improve recommendations.</>,
        ]} />
      </Section>

      <Section title="2. How We Use Your Information">
        <BulletList items={[
          'Show venues, parking, and crowd data relevant to your current location.',
          'Personalize venue recommendations based on your preferences and behavior.',
          'Send push notifications about crowd changes at your saved spots (opt-in only).',
          'Authenticate your account and maintain your session.',
          'Improve our App through aggregated, anonymized usage analytics.',
        ]} />
      </Section>

      <Section title="3. Data Storage & Security">
        <p>
          Most personalization data (preferences, behavior, cached venues) is stored
          locally on your device using browser storage. Account data is stored on our
          servers hosted on Render.com with encrypted connections (TLS).
          Passwords are hashed using industry-standard algorithms and are never stored
          in plain text.
        </p>
      </Section>

      <Section title="4. Third-Party Services">
        <p className="mb-3">We use the following third-party services:</p>
        <BulletList items={[
          <><B>Google Places API</B> — To provide venue information, photos, and nearby search results. Subject to <a href="https://policies.google.com/privacy" className="text-cyan-400 underline" target="_blank" rel="noopener noreferrer">Google's Privacy Policy</a>.</>,
          <><B>OpenAI</B> — To power the AI Concierge chat feature. Conversation context is sent to OpenAI's API for response generation. No personally identifiable information is included in these requests.</>,
          <><B>Ticketmaster</B> — To display live events near you.</>,
          <><B>Render.com</B> — Cloud hosting for our API servers and database.</>,
        ]} />
      </Section>

      <Section title="5. Data Sharing">
        <p>
          We do <strong>not</strong> sell, trade, or rent your personal information to
          third parties. We share data only as described above with service providers
          necessary to operate the App.
        </p>
      </Section>

      <Section title="6. Your Rights">
        <BulletList items={[
          'You can delete your account and all associated data by contacting us.',
          'You can revoke location, camera, or notification permissions at any time in your device settings.',
          'You can clear locally stored preferences and behavior data from the Profile settings screen.',
        ]} />
      </Section>

      <Section title="7. Children's Privacy">
        <p>
          Our App is not directed to children under 13. We do not knowingly collect
          personal information from children under 13.
        </p>
      </Section>

      <Section title="8. Changes to This Policy">
        <p>
          We may update this Privacy Policy from time to time. We will notify you of any
          changes by posting the new Privacy Policy in the App and updating the "Last updated" date.
        </p>
      </Section>

      <Section title="9. Contact Us">
        <p>
          If you have questions about this Privacy Policy, contact us at:<br />
          <a href="mailto:bytspotapp@gmail.com" className="text-cyan-400 underline">bytspotapp@gmail.com</a>
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
