import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle, Loader2, RefreshCw, ShieldCheck, ToggleLeft, ToggleRight, XCircle } from 'lucide-react';
import { toast } from 'sonner@2.0.3';
import { trpc } from '../../utils/trpc';
import { getAdminApprovalAccessFromToken } from '../../utils/adminAccess';

type PendingProviderApplication = {
  id: string;
  userId: string;
  status: string;
  currentStep: number;
  submittedAt: string | null;
  updatedAt: string;
  user: { email: string; name: string | null };
  vendor: { id: string; displayName: string; legalName: string | null; onboardingStatus: string; stripeAccountId: string | null } | null;
};

type ApprovalOptions = { activateVendor: boolean; markStripeConnectReady: boolean };

const DEFAULT_OPTIONS: ApprovalOptions = { activateVendor: true, markStripeConnectReady: false };

function formatDate(value: string | null) {
  if (!value) return 'Not submitted';
  return new Date(value).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function AdminApprovals() {
  const access = useMemo(() => getAdminApprovalAccessFromToken(localStorage.getItem('bytspot_auth_token')), []);
  const [applications, setApplications] = useState<PendingProviderApplication[]>([]);
  const [options, setOptions] = useState<Record<string, ApprovalOptions>>({});
  const [loading, setLoading] = useState(false);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadApplications = useCallback(async () => {
    if (!access.allowed) return;
    setLoading(true);
    setError(null);
    try {
      const result = await trpc.admin.listPendingProviderApplications.query({ limit: 50 });
      const rows = Array.isArray(result?.applications) ? result.applications : [];
      setApplications(rows);
      setOptions((current) => Object.fromEntries(rows.map((row: PendingProviderApplication) => [row.id, current[row.id] ?? DEFAULT_OPTIONS])));
    } catch (err: any) {
      const message = err?.message ?? 'Unable to load pending provider approvals.';
      setError(message);
      toast.error('Approval queue unavailable', { description: message });
    } finally {
      setLoading(false);
    }
  }, [access.allowed]);

  useEffect(() => { void loadApplications(); }, [loadApplications]);

  const toggleOption = (id: string, key: keyof ApprovalOptions) => {
    setOptions((current) => ({
      ...current,
      [id]: { ...(current[id] ?? DEFAULT_OPTIONS), [key]: !(current[id] ?? DEFAULT_OPTIONS)[key] },
    }));
  };

  const approve = async (application: PendingProviderApplication) => {
    const selected = options[application.id] ?? DEFAULT_OPTIONS;
    setApprovingId(application.id);
    try {
      await trpc.admin.approveProviderApplication.mutate({
        userId: application.userId,
        activateVendor: selected.activateVendor,
        markStripeConnectReady: selected.markStripeConnectReady,
      });
      toast.success('Provider approved', { description: `${application.user.email} can now access approved Provider status.` });
      await loadApplications();
    } catch (err: any) {
      toast.error('Approval failed', { description: err?.message ?? 'The provider could not be approved.' });
    } finally {
      setApprovingId(null);
    }
  };

  if (!access.allowed) {
    return (
      <div className="min-h-screen bg-slate-950 px-5 py-10 text-white">
        <div className="mx-auto max-w-xl rounded-[28px] border border-rose-300/20 bg-rose-950/30 p-6 shadow-2xl">
          <XCircle className="mb-4 h-10 w-10 text-rose-300" />
          <h1 className="text-2xl font-bold">Provider approvals restricted</h1>
          <p className="mt-3 text-sm leading-6 text-rose-50/80">{access.reason}</p>
          <p className="mt-4 rounded-2xl bg-black/30 p-3 text-xs text-white/50">Required group claim: BYTSPOT_ADMIN or INTERNAL_OPS.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 px-4 py-8 text-white">
      <div className="mx-auto max-w-5xl">
        <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-400/10 px-3 py-1 text-xs font-bold text-cyan-100">
              <ShieldCheck className="h-4 w-4" /> Internal Ops · Provider Approval Queue
            </div>
            <h1 className="text-3xl font-black tracking-tight">Pending Provider Approvals</h1>
            <p className="mt-2 text-sm text-white/55">Signed in as {access.email ?? 'internal operator'}.</p>
          </div>
          <button onClick={loadApplications} disabled={loading} className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-sm font-bold text-white hover:bg-white/15 disabled:opacity-50">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </header>

        {error ? <div className="mb-5 rounded-2xl border border-rose-300/20 bg-rose-500/10 p-4 text-sm text-rose-100">{error}</div> : null}
        {loading ? <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-8 text-center text-white/60"><Loader2 className="mx-auto mb-3 h-8 w-8 animate-spin" />Loading pending applications…</div> : null}
        {!loading && applications.length === 0 ? <div className="rounded-[24px] border border-emerald-300/20 bg-emerald-500/10 p-8 text-center text-emerald-50"><CheckCircle className="mx-auto mb-3 h-9 w-9" />No pending provider applications.</div> : null}

        <div className="grid gap-4">
          {applications.map((application) => {
            const selected = options[application.id] ?? DEFAULT_OPTIONS;
            return (
              <article key={application.id} className="rounded-[28px] border border-white/10 bg-white/[0.045] p-5 shadow-xl shadow-black/20">
                <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.22em] text-white/35">{application.status} · Step {application.currentStep}</p>
                    <h2 className="mt-2 text-xl font-black">{application.vendor?.displayName || application.user.name || 'Unnamed Provider'}</h2>
                    <p className="mt-1 text-sm text-white/60">{application.user.email}</p>
                    <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                      <div className="rounded-2xl bg-black/25 p-3"><dt className="text-white/35">Submitted</dt><dd className="mt-1 font-semibold">{formatDate(application.submittedAt)}</dd></div>
                      <div className="rounded-2xl bg-black/25 p-3"><dt className="text-white/35">Vendor status</dt><dd className="mt-1 font-semibold">{application.vendor?.onboardingStatus ?? 'No vendor workspace'}</dd></div>
                      <div className="rounded-2xl bg-black/25 p-3"><dt className="text-white/35">Stripe account</dt><dd className="mt-1 font-mono text-xs">{application.vendor?.stripeAccountId ?? 'Not connected'}</dd></div>
                      <div className="rounded-2xl bg-black/25 p-3"><dt className="text-white/35">User ID</dt><dd className="mt-1 font-mono text-xs">{application.userId}</dd></div>
                    </dl>
                  </div>
                  <div className="rounded-[24px] border border-white/10 bg-black/30 p-4">
                    <p className="mb-3 text-sm font-black">Review & Approve</p>
                    <button onClick={() => toggleOption(application.id, 'activateVendor')} className="mb-3 flex w-full items-center justify-between rounded-2xl bg-white/5 px-3 py-3 text-left text-sm">
                      <span><b>Activate vendor</b><br /><span className="text-xs text-white/45">Set workspace to active.</span></span>
                      {selected.activateVendor ? <ToggleRight className="h-6 w-6 text-emerald-300" /> : <ToggleLeft className="h-6 w-6 text-white/35" />}
                    </button>
                    <button onClick={() => toggleOption(application.id, 'markStripeConnectReady')} className="mb-4 flex w-full items-center justify-between rounded-2xl bg-white/5 px-3 py-3 text-left text-sm">
                      <span><b>Seed Stripe ready</b><br /><span className="text-xs text-white/45">Testing override for Connect metadata.</span></span>
                      {selected.markStripeConnectReady ? <ToggleRight className="h-6 w-6 text-emerald-300" /> : <ToggleLeft className="h-6 w-6 text-white/35" />}
                    </button>
                    <button onClick={() => approve(application)} disabled={approvingId === application.id} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-400 px-4 py-3 text-sm font-black text-slate-950 hover:bg-emerald-300 disabled:opacity-60">
                      {approvingId === application.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />} Approve Provider
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </div>
  );
}