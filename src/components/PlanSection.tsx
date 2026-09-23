import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, ChevronDown, Plus, Sparkles } from 'lucide-react';
import { DeepSpaceSurface } from './DeepSpaceGround';
import { PLAN_IDEAS, PLAN_NEEDS, PLAN_STEPS, createPlanInput, emptyPlanDraft, planDraftError, type CreatePlanInput, type Plan, type PlanApi, type PlanDraft } from '../utils/planRpc';

const spring = { type: 'spring' as const, stiffness: 320, damping: 30, mass: 0.8 };
interface PlanSectionProps {
  api: PlanApi;
  authenticated: boolean;
  viewerId?: string;
  groundDrawn?: boolean;
  onSignIn: () => void;
  onExploreNeed: (need: string) => void;
}
const dateLabel = (date: string | null) => date ? new Date(date).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : 'Time to be decided';

export function PlanSection({ api, authenticated, viewerId, groundDrawn = false, onSignIn, onExploreNeed }: PlanSectionProps) {
  const reducedMotion = useReducedMotion();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [selected, setSelected] = useState<Plan | null>(null);
  const [creating, setCreating] = useState(false);
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<PlanDraft>(emptyPlanDraft);
  const [showDetails, setShowDetails] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(authenticated);
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [cancelPrompt, setCancelPrompt] = useState(false);
  const [pendingInput, setPendingInput] = useState<CreatePlanInput | null>(null);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const request = useRef(0);
  const busyRef = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const transition = reducedMotion ? { duration: 0 } : spring;

  useEffect(() => {
    let current = true;
    setSelected(null); setPlans([]); setError(''); setLoadError('');
    if (!authenticated) return;
    setLoading(true);
    api.list().then(rows => { if (current) setPlans(rows); })
      .catch(() => { if (current) setLoadError('Your plans could not be loaded. Retry when you are connected.'); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; request.current += 1; };
  }, [api, authenticated, viewerId]);

  useEffect(() => {
    scroll.current?.scrollTo?.({ top: 0 });
    heading.current?.focus({ preventScroll: true });
  }, [step, creating, selected?.id]);

  async function reload() {
    setLoading(true); setLoadError('');
    try { setPlans(await api.list()); }
    catch { setLoadError('Your plans could not be loaded. Retry when you are connected.'); }
    finally { setLoading(false); }
  }

  async function run(action: () => Promise<void>) {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setError('');
    const version = ++request.current;
    try { await action(); }
    catch { if (request.current === version) setError('That action could not be completed. Your draft is unchanged. Please retry.'); }
    finally { if (request.current === version) { busyRef.current = false; setBusy(false); } }
  }

  function start(idea?: typeof PLAN_IDEAS[number]) {
    if (!authenticated) { onSignIn(); return; }
    setDraft(idea ? { ...emptyPlanDraft(), ...idea, needs: [...idea.needs] } : emptyPlanDraft());
    setPendingInput(null); setCreatedId(null); setStep(0); setError(''); setCreating(true); setSelected(null); setShowDetails(false);
  }

  function advance() {
    const problem = planDraftError(draft);
    if (problem) { setError(problem); return; }
    setError(''); setStep(value => Math.min(value + 1, 2));
  }

  async function create() {
    if (busyRef.current) return;
    if (!authenticated) { onSignIn(); return; }
    const problem = planDraftError(draft);
    if (problem) { setError(problem); return; }
    // Once sent, retry the same payload/key. A timeout may have committed on
    // the server. Never turn a retry into a second plan or change its intent.
    const input = pendingInput ?? createPlanInput(draft, crypto.randomUUID());
    setPendingInput(input);
    await run(async () => {
      const id = createdId ?? await api.create(input);
      setCreatedId(id);
      const plan = await api.get(id);
      setPlans(rows => [plan, ...rows.filter(row => row.id !== id)]);
      setSelected(plan); setCreating(false); setPendingInput(null); setCreatedId(null);
    });
  }

  async function updatePlan(action: 'confirm' | 'cancel' | 'accepted' | 'maybe' | 'declined') {
    if (!selected) return;
    const id = selected.id;
    await run(async () => {
      if (action === 'confirm' || action === 'cancel') await api[action](id);
      else await api.respond(id, action);
      const plan = await api.get(id);
      setSelected(plan); setCancelPrompt(false);
      setPlans(rows => rows.map(row => row.id === id ? plan : row));
    });
  }

  const title = creating ? PLAN_STEPS[step] : selected ? selected.title : 'Plan';
  const editable = !busy && !pendingInput;
  const activePlan = selected && !['cancelled', 'completed', 'expired'].includes(selected.state);
  const owner = Boolean(viewerId && selected?.creatorUserId === viewerId);
  const press = reducedMotion ? undefined : { scale: 0.97 };
  const patchDraft = (values: Partial<PlanDraft>) => setDraft(current => ({ ...current, ...values }));

  return <DeepSpaceSurface alreadyDrawn={groundDrawn}>
    <section className="plan-section" aria-label="Plan" data-testid="plan-section">
      <div className="plan-scroll" ref={scroll}>
        <header className="plan-header">
          <p className="plan-eyebrow">YOUR TIME. YOUR PEOPLE.</p>
          <h1 ref={heading} tabIndex={-1}>{title}</h1>
          {!creating && !selected && <p>One idea. A plan you can make happen.</p>}
          {creating && <ol className="plan-progress" aria-label="Plan creation steps">{PLAN_STEPS.map((label, index) => <li key={label} aria-current={index === step ? 'step' : undefined}><span />{label}</li>)}</ol>}
        </header>
        {error && <p className="plan-notice" role="alert">{error}</p>}
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={creating ? `step-${step}` : selected ? selected.id : 'overview'} initial={{ opacity: 0, y: reducedMotion ? 0 : 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: reducedMotion ? 0 : -8 }} transition={transition} className="plan-stack">
            {!creating && !selected && <>
              <div className="plan-panel plan-intro">
                <Sparkles aria-hidden="true" className="plan-accent" size={32} />
                <h2>Start with the idea.</h2>
                <p>Bring the place, people, and practical details together. Creating a plan does not book anything.</p>
                <motion.button className="plan-button plan-primary" whileTap={press} transition={transition} onClick={() => start()}><Plus aria-hidden="true" size={20} />Start a Plan</motion.button>
              </div>
              <section aria-labelledby="plan-ideas-heading" className="plan-stack">
                <h2 id="plan-ideas-heading">A little inspiration</h2>
                <div className="plan-ideas">{PLAN_IDEAS.map(idea => <motion.button key={idea.title} className="plan-panel plan-idea" onClick={() => start(idea)} whileTap={press} transition={transition}><span>{idea.title}</span><ArrowRight aria-hidden="true" size={20} /></motion.button>)}</div>
                <p className="plan-footnote">Ideas only—not reserved places or confirmed availability.</p>
              </section>
              <section aria-labelledby="plan-list-heading" className="plan-stack">
                <h2 id="plan-list-heading">Your plans</h2>
                {!authenticated ? <div className="plan-panel"><p>Sign in to create a plan or see the plans you are part of.</p><button className="plan-button" onClick={onSignIn}>Sign in</button></div>
                  : loading ? <p role="status">Loading your plans…</p>
                    : loadError ? <div className="plan-panel" role="alert"><p>{loadError}</p><button className="plan-button" onClick={() => void reload()}>Retry loading plans</button></div>
                      : !plans.length ? <div className="plan-panel"><h3>Room for your next idea</h3><p>No plans yet. Start one above, then decide the details with your people.</p></div>
                        : plans.map(plan => <button key={plan.id} className="plan-panel plan-row" disabled={busy} onClick={() => void run(async () => { setSelected(await api.get(plan.id)); })}><span><strong>{plan.title}</strong><span className="plan-footnote">{dateLabel(plan.startsAt)}</span><span className="plan-footnote">{plan.readiness.going} going · {plan.readiness.pending} pending</span></span><span className="plan-badge">{plan.state}</span></button>)}
              </section>
            </>}
            {creating && step === 0 && <div className="plan-panel plan-stack">
              <h2>What do you have in mind?</h2>
              <label>Plan title<input maxLength={80} value={draft.title} disabled={!editable} onChange={event => patchDraft({ title: event.target.value })} placeholder="A night with the crew" autoComplete="off" /></label>
              <label>The idea<textarea maxLength={280} value={draft.intent} disabled={!editable} onChange={event => patchDraft({ intent: event.target.value })} placeholder="What would make this time together great?" rows={3} /></label>
              <p className="plan-footnote">You can leave time and group size open until you know.</p>
            </div>}
            {creating && step === 1 && <>
              <div className="plan-panel plan-stack"><h2>What should this plan include?</h2><p>Choose what you still need. Nothing is held or booked here.</p><div className="plan-needs">{PLAN_NEEDS.map(need => <motion.button key={need} aria-pressed={draft.needs.includes(need)} className="plan-button plan-choice" whileTap={press} transition={transition} disabled={!editable} onClick={() => patchDraft({ needs: draft.needs.includes(need) ? draft.needs.filter(item => item !== need) : [...draft.needs, need] })}>{draft.needs.includes(need) && <Check aria-hidden="true" size={16} />}{need}</motion.button>)}</div></div>
              <div className="plan-panel"><button className="plan-disclosure" aria-expanded={showDetails} aria-controls="plan-timing-fields" onClick={() => setShowDetails(value => !value)}>Time & group size · optional<ChevronDown aria-hidden="true" size={20} /></button><AnimatePresence initial={false}>{showDetails && <motion.div id="plan-timing-fields" className="plan-stack plan-disclosure-content" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={transition}>
                <label>Date & time<input type="datetime-local" disabled={!editable} value={draft.startsAt} onChange={event => patchDraft({ startsAt: event.target.value })} /></label>
                <label>Group size<input type="number" inputMode="numeric" min={1} max={200} step={1} disabled={!editable} value={draft.partySize} onChange={event => patchDraft({ partySize: event.target.value })} placeholder="To be decided" /></label>
              </motion.div>}</AnimatePresence></div>
            </>}
            {creating && step === 2 && <div className="plan-panel plan-stack"><h2>{draft.title}</h2><p>{draft.intent}</p><dl className="plan-summary"><dt>When</dt><dd>{dateLabel(draft.startsAt || null)}</dd><dt>People</dt><dd>{draft.partySize || 'To be decided'}</dd><dt>Still to arrange</dt><dd>{draft.needs.join(', ') || 'No needs selected'}</dd></dl><p className="plan-footnote">This creates a proposed plan. Attendance, bookings, and payments are confirmed separately.</p>{pendingInput && <p role="status">{createdId ? 'Your plan was created. Retry to load it.' : 'An attempt was sent. Retry safely with the same details.'}</p>}</div>}
            {selected && !creating && <>
              <div className="plan-panel plan-stack"><span className="plan-badge">{selected.state}</span><p>{selected.intent}</p><dl className="plan-summary"><dt>When</dt><dd>{dateLabel(selected.startsAt)}</dd><dt>Group size</dt><dd>{selected.partySize ?? 'To be decided'}</dd><dt>Attendance</dt><dd>{selected.readiness.going} going · {selected.readiness.maybe} maybe · {selected.readiness.pending} pending</dd></dl><p className="plan-footnote">Plan confirmation is the organizer's decision—not a booking or everyone's RSVP.</p></div>
              <div className="plan-panel plan-stack"><h2>Still to arrange</h2>{selected.openNeeds.length ? selected.openNeeds.map(need => <button className="plan-button plan-choice" key={need} onClick={() => onExploreNeed(need)}>Explore {need}<ArrowRight size={16} aria-hidden="true" /></button>) : <p>No open needs. Check individual items for booking status.</p>}<p className="plan-footnote">Exploring does not attach or book an option.</p></div>
              {!!selected.items.length && <div className="plan-panel plan-stack"><h2>In this plan</h2>{selected.items.map(item => <div key={item.id}><h3>{item.title}</h3><p>{item.status === 'cancelled' ? 'Cancelled' : item.booked ? 'Booked' : 'Not booked'} · {item.needKind}</p></div>)}</div>}
              {activePlan && <div className="plan-panel plan-stack"><h2>{owner ? 'Organize your plan' : 'Your attendance'}</h2>{owner && selected.state === 'proposed' && <button className="plan-button plan-primary" disabled={busy} onClick={() => void updatePlan('confirm')}>Confirm plan</button>}{(['accepted', 'maybe', 'declined'] as const).map(response => <button key={response} className="plan-button" disabled={busy} onClick={() => void updatePlan(response)}>{response === 'accepted' ? "I'm going" : response === 'maybe' ? 'Maybe' : "Can't go"}</button>)}{owner && <button className="plan-button" disabled={busy} onClick={() => setCancelPrompt(true)}>Cancel plan…</button>}{cancelPrompt && <div role="group" aria-label="Confirm cancellation"><p>Cancel this plan? This cannot be undone and does not cancel separate bookings.</p><button className="plan-button" disabled={busy} onClick={() => void updatePlan('cancel')}>Yes, cancel plan</button><button className="plan-button" disabled={busy} onClick={() => setCancelPrompt(false)}>Keep plan</button></div>}</div>}
            </>}
          </motion.div>
        </AnimatePresence>
      </div>
      {(creating || selected) && <footer className="plan-footer">
        <motion.button className="plan-button" whileTap={press} transition={transition} disabled={busy || Boolean(pendingInput)} onClick={() => { setError(''); setCancelPrompt(false); if (creating && step > 0) setStep(value => value - 1); else { setCreating(false); setSelected(null); } }}><ArrowLeft aria-hidden="true" size={20} />{creating && step > 0 ? 'Back' : 'All plans'}</motion.button>
        {creating && <motion.button className="plan-button plan-primary" whileTap={press} transition={transition} disabled={busy} onClick={() => step === 2 ? void create() : advance()}>{busy ? 'Saving…' : step === 2 ? pendingInput ? 'Retry safely' : 'Create plan' : 'Continue'}{!busy && <ArrowRight aria-hidden="true" size={20} />}</motion.button>}
      </footer>}
      {busy && <span className="plan-sr-only" role="status">Updating plan…</span>}
    </section>
  </DeepSpaceSurface>;
}
