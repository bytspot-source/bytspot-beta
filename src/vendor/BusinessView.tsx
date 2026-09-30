import { useEffect, useState } from 'react';
import { BusinessKindPicker } from './OnboardingView';
import { onboardingItems, verifiedLabel } from './onboarding';
import type { ProfileEdit, VendorProfile } from './profile';
import { staffRoleLabel, getVendorBookableType } from './vendorConsole';
import type { ConsoleTransport } from './consoleTransport';
import type { VendorSession } from './seller';

interface BusinessViewProps {
  session: VendorSession;
  profile: VendorProfile;
  blockers: string[];
  busy: boolean;
  canEdit: boolean;
  onEdit: (edit: ProfileEdit) => void;
}

function TextSetting({
  label,
  type,
  value,
  disabled,
  onSave,
}: {
  label: string;
  type: 'text' | 'email';
  value?: string;
  disabled: boolean;
  onSave: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value ?? '');
  useEffect(() => setDraft(value ?? ''), [value]);
  const changed = draft.trim() !== (value ?? '') && draft.trim().length > 0;
  return (
    <label className="vendor-field">
      <span>{label}</span>
      <input
        type={type}
        value={draft}
        maxLength={type === 'email' ? 320 : 200}
        disabled={disabled}
        onChange={(event) => setDraft(event.target.value)}
      />
      {changed ? (
        <button type="button" className="vendor-chip vendor-chip-on" disabled={disabled} onClick={() => onSave(draft.trim())}>
          Save
        </button>
      ) : null}
    </label>
  );
}

/** Who the business is: name, contact email, what it sells, and where it stands. */
export function BusinessView({ session, profile, blockers, busy, canEdit, onEdit }: BusinessViewProps) {
  const verified = verifiedLabel(session.seller);
  const items = onboardingItems(session.seller);
  const extras = (profile.extraBookableTypes ?? []).map((id) => getVendorBookableType(id)?.label ?? id);

  return (
    <>
      <section className="vendor-card">
        <h2 className="vendor-section-title">Details</h2>
        <TextSetting
          label="Business name guests see"
          type="text"
          value={profile.legalName}
          disabled={!canEdit || busy}
          onSave={(value) => onEdit({ field: 'legalName', value })}
        />
        <TextSetting
          label="Contact email for bookings"
          type="email"
          value={profile.contactEmail}
          disabled={!canEdit || busy}
          onSave={(value) => onEdit({ field: 'contactEmail', value })}
        />
        {blockers.length ? (
          <ul className="vendor-reasons">
            {blockers.map((reason) => (
              <li key={reason} className="vendor-reason-fixable">{reason}</li>
            ))}
          </ul>
        ) : null}
      </section>

      <section className="vendor-card">
        <BusinessKindPicker
          mode={session.seller.businessMode}
          kind={profile.businessKind}
          busy={busy || !canEdit}
          onPick={(id) => onEdit({ field: 'businessKind', value: id })}
        />
        <p className="vendor-muted">
          {extras.length ? `Also selling: ${extras.join(', ')}. ` : ''}Add another category from Bookables.
        </p>
      </section>

      <section className="vendor-card">
        <h2 className="vendor-section-title">Status</h2>
        <p className="vendor-muted">Business is {session.seller.state.toLowerCase()}.</p>
        {verified ? <p className="vendor-verified">✓ {verified}</p> : null}
        <ul className="vendor-reasons">
          {items.map((item) => (
            <li key={item.requirement.id} className={item.done ? undefined : 'vendor-reason-fixable'}>
              {item.done ? '✓ ' : ''}
              {item.requirement.label}
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

interface SettingsViewProps {
  session: VendorSession;
  transport: ConsoleTransport;
  onSignOut: () => void;
}

/** This seat and this sign-in. Business details live under Business. */
export function SettingsView({ session, transport, onSignOut }: SettingsViewProps) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');

  const signOutEverywhere = async () => {
    setBusy(true);
    const result = await transport.signOutEverywhere();
    setBusy(false);
    if (!result.value) {
      setProblem(result.blockers?.[0] ?? 'That did not go through. Try again');
      return;
    }
    onSignOut();
  };

  return (
    <>
      <section className="vendor-card">
        <h2 className="vendor-section-title">Your seat</h2>
        <p className="vendor-muted">
          {staffRoleLabel(session.seat.role)} at {session.seller.legalName}
          {session.scope === 'assigned' ? ' · assigned work only' : ''}
        </p>
        <p className="vendor-muted">
          You can {[...session.capabilities].map((capability) => capability.toLowerCase().replace(/_/g, ' ')).join(', ') || 'view only'}.
        </p>
      </section>

      <section className="vendor-card">
        <h2 className="vendor-section-title">Sign-in</h2>
        <p className="vendor-muted">You sign in with a code sent to your email. There is no password to change.</p>
        <div className="vendor-demand-actions">
          <button type="button" className="vendor-chip" onClick={onSignOut}>
            Sign out
          </button>
          {confirming ? (
            <>
              <button type="button" className="vendor-chip vendor-chip-on" disabled={busy} onClick={() => void signOutEverywhere()}>
                {busy ? 'Signing out…' : 'Yes, sign out everywhere'}
              </button>
              <button type="button" className="vendor-chip" onClick={() => setConfirming(false)}>
                Cancel
              </button>
            </>
          ) : (
            <button type="button" className="vendor-chip" onClick={() => setConfirming(true)}>
              Sign out on every device
            </button>
          )}
        </div>
        {problem ? <p className="vendor-muted vendor-reason-fixable">{problem}</p> : null}
      </section>
    </>
  );
}
