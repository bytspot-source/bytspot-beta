import { useMemo, useState } from 'react';
import { getBookableLocations, getLocationKind } from '../utils/bookableTemplates.ts';
import type { BookableLocationKindId } from '../utils/bookableTemplates.ts';
import type { VendorLocation } from './locations.ts';
import {
  canAdvanceOnboarding,
  nextOnboardingItem,
  onboardingActions,
  onboardingCopy,
  onboardingItems,
  onboardingProgress,
  onboardingStage,
  willStallAfterApproval,
  type OnboardingItem,
} from './onboarding.ts';
import type { GeocodeCandidate } from './geocoding.ts';
import { LocationForm } from './LocationForm.tsx';
import { payoutIsUsable, type ProfileEdit, type VendorProfile } from './profile.ts';
import type { VendorSession } from './seller.ts';
import { staffRoleLabel } from './vendorConsole.ts';

export interface OnboardingViewProps {
  session: VendorSession;
  profile: VendorProfile;
  /** Rejected edits come back as blockers rather than being applied. */
  onEdit: (edit: ProfileEdit) => void;
  onStartPayout: () => void;
  onGeocode: (query: string, kind: BookableLocationKindId) => Promise<GeocodeCandidate[]>;
  onMove: (operation: 'SUBMIT_SELLER' | 'WITHDRAW_SELLER') => void;
  blockers: string[];
  busy: boolean;
}

/**
 * The gate a business passes through on the way to selling. It reads the seller
 * rather than tracking a position, so closing a location puts an item back and
 * satisfying one takes it away without anything being reset.
 */
export function OnboardingView({
  session,
  profile,
  onEdit,
  onStartPayout,
  onGeocode,
  onMove,
  blockers,
  busy,
}: OnboardingViewProps) {
  const { seller } = session;
  const items = useMemo(() => onboardingItems(seller), [seller]);
  const stage = onboardingStage(seller);
  const progress = onboardingProgress(seller);
  const copy = onboardingCopy(seller.state);
  const next = nextOnboardingItem(seller);
  const actions = useMemo(() => onboardingActions(session), [session]);
  const canAdvance = canAdvanceOnboarding(session);
  const stalls = useMemo(() => (seller.state === 'DRAFT' ? willStallAfterApproval(seller) : []), [seller]);

  return (
    <>
      <section className="vendor-card">
        <h2 className="vendor-section-title">{copy?.title ?? 'Set up'}</h2>
        <p className="vendor-muted vendor-question">{copy?.body}</p>
        <p className="vendor-muted">
          {progress.done} of {progress.total} done
        </p>

        {!canAdvance ? (
          <p className="vendor-muted">
            A {staffRoleLabel(session.seat.role)} seat can see what is missing but cannot supply it. The owner finishes
            this.
          </p>
        ) : null}

        {blockers.length > 0 ? (
          <ul className="vendor-reasons">
            {blockers.map((blocker) => (
              <li key={blocker} className="vendor-reason-fixable">
                {blocker}
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      {copy?.checklist ? (
        <ul className="vendor-demand-list">
          {items.map((item) => (
            <ChecklistRow
              key={item.requirement.id}
              item={item}
              session={session}
              profile={profile}
              editable={canAdvance && !item.done && item.requirement.id === next?.requirement.id}
              busy={busy}
              onEdit={onEdit}
              onStartPayout={onStartPayout}
              onGeocode={onGeocode}
            />
          ))}
        </ul>
      ) : null}

      {stage === 'awaiting-review' ? (
        <section className="vendor-card">
          <p className="vendor-muted">
            Submitted as {seller.legalName}. Nothing here can speed it up, so there is nothing to fill in.
          </p>
        </section>
      ) : null}

      {stalls.length > 0 && stage === 'ready-to-submit' ? (
        <section className="vendor-card vendor-card-blank">
          <p className="vendor-muted">
            You can submit now, but approval will not make you sellable until{' '}
            {stalls.map((item) => item.label.toLowerCase()).join(' and ')} {stalls.length === 1 ? 'is' : 'are'} done.
          </p>
        </section>
      ) : null}

      {canAdvance
        ? actions.map((action) => (
            <section className="vendor-card" key={action.id}>
              <button
                type="button"
                className="vendor-button"
                disabled={!action.verdict.ok || busy}
                onClick={() => onMove(action.id)}
              >
                {action.label}
              </button>
              {!action.verdict.ok ? (
                <ul className="vendor-reasons">
                  {action.verdict.reason === 'requirements-unmet' ? (
                    (action.verdict.missing ?? []).map((requirement) => (
                      <li key={requirement.id} className="vendor-reason-fixable">
                        {requirement.label} is still missing
                      </li>
                    ))
                  ) : (
                    <li>{refusalCopy(action.verdict.reason)}</li>
                  )}
                </ul>
              ) : null}
            </section>
          ))
        : null}
    </>
  );
}

function refusalCopy(reason: 'forbidden' | 'illegal-state' | 'requirements-unmet'): string {
  if (reason === 'forbidden') return 'This seat cannot move the business.';
  if (reason === 'illegal-state') return 'The business is not in a state this applies to.';
  return 'Something is still missing.';
}

function ChecklistRow({
  item,
  session,
  profile,
  editable,
  busy,
  onEdit,
  onStartPayout,
  onGeocode,
}: {
  item: OnboardingItem;
  session: VendorSession;
  profile: VendorProfile;
  editable: boolean;
  busy: boolean;
  onEdit: (edit: ProfileEdit) => void;
  onStartPayout: () => void;
  onGeocode: OnboardingViewProps['onGeocode'];
}) {
  const { step } = item;

  return (
    <li className="vendor-card">
      <p className="vendor-section-title">
        {item.done ? '✓ ' : ''}
        {step.title}
      </p>
      <p className="vendor-muted">{step.question}</p>
      <p className="vendor-muted">
        {item.done ? 'Done. ' : `${item.requirement.label} — `}
        {item.done ? `Needed before ${item.blocks.toLowerCase()}.` : `blocks ${item.blocks.toLowerCase()}.`}
      </p>

      {!editable ? null : step.kind === 'location' ? (
        <LocationForm
          session={session}
          cottageKind={step.cottageKind}
          busy={busy}
          onEdit={onEdit}
          onGeocode={onGeocode}
        />
      ) : step.kind === 'payout' ? (
        <PayoutField profile={profile} busy={busy} onStartPayout={onStartPayout} />
      ) : (
        <TextField field={step.field} kind={step.kind} busy={busy} onEdit={onEdit} />
      )}
    </li>
  );
}

function TextField({
  field,
  kind,
  busy,
  onEdit,
}: {
  field: string;
  kind: 'text' | 'email';
  busy: boolean;
  onEdit: (edit: ProfileEdit) => void;
}) {
  const [value, setValue] = useState('');
  const target = kind === 'email' ? 'contactEmail' : 'legalName';

  return (
    <>
      <label className="vendor-field">
        <span>{field}</span>
        <input
          value={value}
          onChange={(event) => setValue(event.target.value)}
          type={kind === 'email' ? 'email' : 'text'}
          inputMode={kind === 'email' ? 'email' : 'text'}
          autoComplete={kind === 'email' ? 'email' : 'organization'}
        />
      </label>
      <button
        type="button"
        className="vendor-button"
        disabled={busy || value.trim().length === 0}
        onClick={() => onEdit({ field: target, value } as ProfileEdit)}
      >
        Save
      </button>
    </>
  );
}

/**
 * A handoff, not a form. Bank details entered here would live in the DOM, in a
 * devtools snapshot and in any error report that serialises component state, so
 * the processor collects them and we are handed back a reference and a status.
 */
function PayoutField({
  profile,
  busy,
  onStartPayout,
}: {
  profile: VendorProfile;
  busy: boolean;
  onStartPayout: () => void;
}) {
  const payout = profile.payout;

  if (payout && !payoutIsUsable(payout)) {
    return (
      <>
        <p className="vendor-muted">
          {payout.status === 'restricted'
            ? 'Your payout provider is holding this account.'
            : 'Your payout provider is still checking this account.'}
          {payout.detail ? ` ${payout.detail}` : ''}
        </p>
        <button type="button" className="vendor-button" disabled={busy} onClick={onStartPayout}>
          Continue with provider
        </button>
      </>
    );
  }

  return (
    <>
      <p className="vendor-muted">
        Bank details are entered with our payment provider, not here. We are given back an account reference and
        whether it can receive money.
      </p>
      <button type="button" className="vendor-button" disabled={busy} onClick={onStartPayout}>
        Set up payouts
      </button>
    </>
  );
}
