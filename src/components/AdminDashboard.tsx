import { ShieldCheck, Tags } from 'lucide-react';
import { AdminApprovals } from './admin/AdminApprovals';
import { StaffPatchWriter } from './admin/StaffPatchWriter';

export function AdminDashboard() {
  return (
    <div className="min-h-screen bg-slate-950 px-4 py-8 text-white">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="rounded-[28px] border border-white/10 bg-white/[0.04] p-6 shadow-2xl shadow-black/25">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-400/10 px-3 py-1 text-xs font-bold text-cyan-100">
            <ShieldCheck className="h-4 w-4" /> Internal Ops
          </div>
          <h1 className="text-3xl font-black tracking-tight">Admin Dashboard</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-white/60">
            Review provider approvals and provision verified Bytspot patch stickers from one staff surface.
          </p>
        </header>

        <section className="rounded-[28px] border border-white/10 bg-white/[0.035] p-4 shadow-xl shadow-black/20">
          <div className="mb-4 flex items-center gap-2 px-1 text-sm font-black text-white/80">
            <Tags className="h-4 w-4 text-cyan-200" /> Patch provisioning
          </div>
          <StaffPatchWriter />
        </section>

        <AdminApprovals />
      </div>
    </div>
  );
}
