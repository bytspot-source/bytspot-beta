/**
 * Terms of Service / EULA — required for App Store submission and litigation protection.
 * Accessible at /terms (no auth required).
 * Last updated: 2026-11-11
 */
export function TermsOfService() {
  return (
    <div className="min-h-screen bg-black text-white/90 px-6 py-12 max-w-2xl mx-auto leading-relaxed">
      <h1 className="text-3xl font-bold mb-2">Terms of Service</h1>
      <p className="text-white/50 text-sm mb-8">Last updated: November 11, 2026</p>

      <p className="mb-6">
        These Terms of Service ("Terms") govern your use of the Bytspot mobile application
        and App Clip ("App") operated by Bytspot ("Company", "we", "us", or "our"). By downloading,
        installing, or using the App, you agree to be bound by these Terms.
      </p>

      <Section title="1. License & Intellectual Property">
        <p className="mb-3">
          We grant you a limited, non-exclusive, non-transferable, revocable license to
          use the App for personal, non-commercial purposes. The App, including all
          content, features, algorithms, designs, source code, and data models, is and
          remains the exclusive intellectual property of Bytspot.
        </p>
        <BulletList items={[
          <>You may <B>not</B> copy, modify, distribute, reverse-engineer, decompile, or create derivative works of the App.</>,
          <>You may <B>not</B> use the App's data, APIs, or content for any competing product or commercial purpose.</>,
          <>All trademarks, logos, and branding are the property of Bytspot.</>,
        ]} />
      </Section>

      <Section title="2. What Bytspot Is">
        <p className="mb-3">
          Bytspot is a platform. It helps you find places, make plans, and connect with hosts, venues,
          businesses, and sellers ("Providers"). Bytspot does not host parties, run venues, or sell items
          listed by members.
        </p>
        <BulletList items={[
          <>Each Provider is solely responsible for its event, place, offer, or item: that it is lawful, safe, and delivered as described, including age and alcohol rules.</>,
          <>When you buy a pass or book with a Provider, your agreement for that event or service is with the Provider. Bytspot collects payment on the Provider's behalf through Stripe and passes it on.</>,
          <>We cannot guarantee that members are who they say they are. You are responsible for your interactions with other members and Providers, online and in person.</>,
        ]} />
      </Section>

      <Section title="3. Passes, Payments, and Refunds">
        <BulletList items={[
          <>Prices are shown before you pay. Payments are processed by Stripe, and you authorize us to charge your chosen payment method.</>,
          <>If a host cancels a party, or closes it before it takes place, paid passes are refunded automatically to the original payment method.</>,
          <>Other refund requests go to the host or business. A pass that has been used, or an event that took place, is not refundable except where the law requires.</>,
          <>Bottle minimums and other spending at a venue are paid to the venue, not through Bytspot.</>,
          <>A pass is for the person it was issued to. Passes may not be resold above face value.</>,
          <>If a payment is disputed, refunded, or flagged as fraud, the related pass may be cancelled.</>,
        ]} />
      </Section>

      <Section title="4. Private Sales">
        <BulletList items={[
          <>Private Sales are arranged directly between buyer and seller. Bytspot is not a party to the sale and does not hold, move, or protect money for Private Sales.</>,
          <>Sellers are responsible for what they list and must follow our prohibited-items rules. Tickets may not be listed above face value.</>,
          <>Meet in a public place, check the item before you pay, and report anything unsafe. Bytspot cannot help with returns or refunds for Private Sales.</>,
        ]} />
      </Section>

      <Section title="5. Bytspot Points">
        <BulletList items={[
          <>Points are earned for check-ins that your location confirms, within the limits shown in the App.</>,
          <>Points have no cash value, cannot be sold or transferred, and are not property.</>,
          <>We may remove points earned by mistake, by faking your location, or by breaking these Terms, and we may change or end the points program at any time.</>,
        ]} />
      </Section>

      <Section title="6. Disclaimer of Warranties">
        <p className="mb-3">
          THE APP IS PROVIDED ON AN "AS IS" AND "AS AVAILABLE" BASIS WITHOUT WARRANTIES
          OF ANY KIND, EITHER EXPRESS OR IMPLIED.
        </p>
        <BulletList items={[
          <><B>Crowd data</B> is estimated using algorithms and may not reflect actual conditions.</>,
          <><B>Parking availability and pricing</B> are informational only and may change without notice.</>,
          <><B>AI Concierge recommendations</B> are generated by machine learning models and should not be relied upon as professional advice.</>,
          <><B>Venue information</B> (hours, menus, ratings) is sourced from third parties and may be inaccurate.</>,
          <><B>Location, maps, and arrival times</B> may be inaccurate and should not be relied on where precise location matters for safety.</>,
        ]} />
      </Section>

      <Section title="7. Limitation of Liability">
        <p className="mb-3">
          TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, BYTSPOT SHALL NOT BE LIABLE
          FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES,
          INCLUDING BUT NOT LIMITED TO:
        </p>
        <BulletList items={[
          <>Loss of profits, data, or business opportunities.</>,
          <>Personal injury or property damage resulting from your use of the App.</>,
          <>Parking violations, towing, or fees incurred based on App information.</>,
          <>Decisions made based on AI Concierge recommendations.</>,
          <>Service interruptions, errors, or inaccuracies in real-time data.</>,
          <>The acts or omissions of other members or Providers, at an event or anywhere else.</>,
        ]} />
        <p className="mt-3">
          Our total liability for any claim arising from your use of the App shall not
          exceed the amount you paid to us in the twelve (12) months preceding the claim,
          or fifty US dollars ($50), whichever is greater.
        </p>
      </Section>

      <Section title="8. User Conduct">
        <BulletList items={[
          <>You agree to use the App only for lawful purposes.</>,
          <>You will not submit false, misleading, or harmful content.</>,
          <>You will not attempt to interfere with the App's operation or security.</>,
          <>You are responsible for maintaining the confidentiality of your account.</>,
          <>You must be at least 13 years old to use the App, and 21 or older to attend parties that serve alcohol.</>,
          <>You will not fake your location, create more than one account, or get around a block, suspension, or other safety measure.</>,
          <>You will not scrape, copy, or resell content or data from the App.</>,
          <>There is no tolerance for objectionable content or abusive users. You will not post content that is sexually explicit, hateful, violent, threatening, harassing, fraudulent, or that impersonates someone, and you will not harass, threaten, or abuse other members.</>,
        ]} />
        <p className="mt-3">
          You can report any member, party, review, or Private Sale from its menu in the App, and block any
          member so neither of you sees the other. We review reports within 24 hours. Content that breaks
          these Terms is removed, and accounts that post it or abuse other members are suspended or removed.
          Safety concerns can also be sent to{' '}
          <a href="mailto:safety@bytspot.com" className="text-blue-400 underline">safety@bytspot.com</a>.
        </p>
      </Section>

      <Section title="9. User Content">
        <p>
          By posting content (reviews, photos, check-ins) through the App, you grant
          Bytspot a worldwide, non-exclusive, royalty-free license to use, display, and
          distribute that content within the App. You retain ownership of your content
          but are solely responsible for its accuracy and legality.
        </p>
      </Section>

      <Section title="10. Third-Party Services">
        <p>
          The App integrates with third-party services (mapping data, ride-share
          links, payment processors). We are not responsible for the availability,
          accuracy, or practices of these third-party services. Your use of them is
          governed by their respective terms and privacy policies.
        </p>
      </Section>

      <Section title="11. Termination">
        <p>
          We reserve the right to suspend or terminate your access to the App at any
          time, with or without cause or notice. Upon termination, your license to use
          the App is immediately revoked.
        </p>
      </Section>

      <Section title="12. Governing Law & Dispute Resolution">
        <p>
          These Terms are governed by the laws of the State of Georgia, United States,
          without regard to conflict of law principles. Any disputes shall be resolved
          through binding arbitration in Atlanta, Georgia, under the rules of the
          American Arbitration Association. You waive any right to participate in a
          class action lawsuit or class-wide arbitration.
        </p>
      </Section>

      <Section title="13. Apple">
        <p>
          These Terms are between you and Bytspot, not Apple. Apple is not responsible for the App or its content,
          and has no obligation to provide support for it. Apple and its subsidiaries are third-party beneficiaries
          of these Terms and may enforce them against you. If these Terms conflict with Apple's Licensed Application
          End User License Agreement, these Terms control.
        </p>
      </Section>

      <Section title="14. Changes to Terms">
        <p>
          We may update these Terms at any time. Continued use of the App after changes
          constitutes acceptance of the revised Terms. Material changes will be
          communicated through the App or via email.
        </p>
      </Section>

      <Section title="15. Contact Us">
        <p>
          Questions about these Terms? Contact us at{' '}
          <a href="mailto:legal@bytspot.com" className="text-blue-400 underline">legal@bytspot.com</a>.
          To report abuse or a safety concern, email{' '}
          <a href="mailto:safety@bytspot.com" className="text-blue-400 underline">safety@bytspot.com</a>.
        </p>
      </Section>

      <div className="mt-12 pt-6 border-t border-white/10 text-white/40 text-xs text-center">
        © {new Date().getFullYear()} Bytspot. All rights reserved.
      </div>
    </div>
  );
}

/* ── Helpers (same as PrivacyPolicy) ── */

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
