import { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { CheckCircle2, Copy, ExternalLink, Link, Package, Plus, Radio, Shield, Smartphone } from 'lucide-react';
import { ProviderPremiumGate } from '../../provider/ProviderPremiumGate';
import { type ProviderDashboardAccess } from './providerDashboardAccess';
import { useProviderDashboardData } from '../../../utils/providerDashboardData';

interface ProviderPatchRecord {
  id: string;
  label: string;
  venueName: string;
  createdAt: string;
  url: string;
  // Optional so localStorage records written before this field existed continue
  // to deserialize cleanly. New patches always populate both or neither.
  serviceId?: string | null;
  serviceTitle?: string | null;
}

const PATCH_STORE_KEY = 'bytspot_provider_patches';
const PATCH_BASE_URL = 'https://bytspot.app/p/';
const UNASSIGNED_SERVICE_VALUE = '__unassigned__';

function readPatches(): ProviderPatchRecord[] {
  try {
    const raw = localStorage.getItem(PATCH_STORE_KEY);
    return raw ? JSON.parse(raw) as ProviderPatchRecord[] : [];
  } catch {
    return [];
  }
}

function writePatches(patches: ProviderPatchRecord[]): void {
  localStorage.setItem(PATCH_STORE_KEY, JSON.stringify(patches.slice(0, 12)));
}

function slugify(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 36) || 'provider';
}

function buildPatchUrl(patchId: string, venueName: string, serviceId?: string | null): string {
  const encoded = encodeURIComponent(venueName.trim() || 'Bytspot Provider');
  const base = `${PATCH_BASE_URL}${encodeURIComponent(patchId)}?patch=${encodeURIComponent(patchId)}&venue=${encoded}`;
  return serviceId ? `${base}&service=${encodeURIComponent(serviceId)}` : base;
}

export function DashboardPatches({ isDarkMode, access }: { isDarkMode: boolean; access: ProviderDashboardAccess }) {
  const data = useProviderDashboardData();
  const [venueName, setVenueName] = useState(localStorage.getItem('bytspot_provider_business_name') || '');
  const [label, setLabel] = useState('Main Entrance');
  const [serviceSelection, setServiceSelection] = useState<string>(UNASSIGNED_SERVICE_VALUE);
  const [patches, setPatches] = useState<ProviderPatchRecord[]>(() => readPatches());
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const nextPatchId = useMemo(() => `patch-${slugify(venueName || label)}-${Date.now().toString(36).slice(-5)}`, [venueName, label]);
  const springConfig = { type: 'spring' as const, stiffness: 320, damping: 30, mass: 0.8 };
  const panelClass = isDarkMode
    ? 'border-white/15 bg-[linear-gradient(135deg,rgba(15,23,42,0.92),rgba(2,6,23,0.96))]'
    : 'border-slate-700/70 bg-[linear-gradient(135deg,rgba(15,23,42,0.94),rgba(15,23,42,0.98))]';

  const assignableServices = useMemo(
    () => data.services.filter((service) => service.status === 'active' || service.status === 'draft'),
    [data.services],
  );
  const selectedService = serviceSelection === UNASSIGNED_SERVICE_VALUE
    ? null
    : assignableServices.find((service) => service.id === serviceSelection) ?? null;

  const establishPatch = () => {
    const id = nextPatchId;
    const assignedServiceId = selectedService?.id ?? null;
    const assignedServiceTitle = selectedService?.title ?? null;
    const patch: ProviderPatchRecord = {
      id,
      label: label.trim() || 'Main Entrance',
      venueName: venueName.trim() || 'Bytspot Provider',
      createdAt: new Date().toISOString(),
      url: buildPatchUrl(id, venueName, assignedServiceId),
      serviceId: assignedServiceId,
      serviceTitle: assignedServiceTitle,
    };
    const updated = [patch, ...patches.filter((item) => item.id !== id)].slice(0, 12);
    setPatches(updated);
    writePatches(updated);
    localStorage.setItem('bytspot_provider_business_name', patch.venueName);
  };

  const copyPatch = async (patch: ProviderPatchRecord) => {
    await navigator.clipboard?.writeText(patch.url).catch(() => undefined);
    setCopiedId(patch.id);
    window.setTimeout(() => setCopiedId(null), 1800);
  };

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} transition={springConfig}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="mb-2 text-[12px] font-extrabold tracking-[0.24em] text-cyan-200">TAP & SCAN</p>
            <h1 className="mb-2 text-[34px] font-black text-white">Provider Patches</h1>
            <p className="max-w-2xl text-[16px] leading-6 text-slate-200/80">
              Establish reusable Bytspot patch links for entrances, lots, events, and access checkpoints. These URLs work with App Clip and universal links.
            </p>
          </div>
          <div className="inline-flex w-fit items-center gap-2 rounded-full border border-cyan-200/20 bg-cyan-300/10 px-3 py-2 text-[12px] font-extrabold text-cyan-50 shadow-lg shadow-cyan-950/20">
            <Radio className="h-3.5 w-3.5" strokeWidth={2.5} />
            {patches.length} active patch{patches.length === 1 ? '' : 'es'}
          </div>
        </div>
      </motion.div>

      {!access.isCottage && (
      <ProviderPremiumGate
        title="Premium Patch Toolkit"
        description="Keep basic patch creation free. Unlock AI placement, boosted venue context, and QR/NFC rollout planning with Vendor Premium."
        features={[
          'AI-recommended patch placement by entrance, crowd flow, and demand windows',
          'Bulk QR/NFC kit planning for events, lots, and venue checkpoints',
          'Boosted verified patch visibility for customers using Tap & Scan',
        ]}
      />
      )}

      <motion.div className={`grid gap-4 rounded-[28px] border ${panelClass} p-5 shadow-[0_24px_80px_rgba(0,0,0,0.42)] backdrop-blur-2xl ring-1 ring-cyan-200/5 lg:grid-cols-[1fr_0.9fr] lg:p-6`} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ ...springConfig, delay: 0.05 }} data-testid="provider-patches-form">
        <div className="space-y-4">
          <div>
            <label className="mb-2 block text-[13px] font-extrabold text-slate-200">Business / Venue Name</label>
            <input value={venueName} onChange={(event) => setVenueName(event.target.value)} placeholder="Example: Midtown Lounge" className="w-full rounded-[16px] border border-white/15 bg-black/40 px-4 py-3 text-white shadow-inner shadow-black/20 outline-none placeholder:text-slate-500 focus:border-cyan-300/70 focus:ring-2 focus:ring-cyan-300/15" />
          </div>
          <div>
            <label className="mb-2 block text-[13px] font-extrabold text-slate-200">Patch Location / Label</label>
            <input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Main Entrance" className="w-full rounded-[16px] border border-white/15 bg-black/40 px-4 py-3 text-white shadow-inner shadow-black/20 outline-none placeholder:text-slate-500 focus:border-cyan-300/70 focus:ring-2 focus:ring-cyan-300/15" />
          </div>
          <div>
            <label className="mb-2 block text-[13px] font-extrabold text-slate-200">Linked Service <span className="text-slate-400">(optional)</span></label>
            <select
              value={serviceSelection}
              onChange={(event) => setServiceSelection(event.target.value)}
              disabled={!data.authenticated || data.loading || assignableServices.length === 0}
              className="w-full rounded-[16px] border border-white/15 bg-black/40 px-4 py-3 text-white shadow-inner shadow-black/20 outline-none focus:border-cyan-300/70 focus:ring-2 focus:ring-cyan-300/15 disabled:opacity-60"
              data-testid="provider-patches-service-select"
            >
              <option value={UNASSIGNED_SERVICE_VALUE}>Unassigned (general venue patch)</option>
              {assignableServices.map((service) => (
                <option key={service.id} value={service.id}>
                  {service.title}{service.status === 'draft' ? ' (draft)' : ''}
                </option>
              ))}
            </select>
            <p className="mt-2 text-[12px] leading-5 text-slate-300/80" data-testid="provider-patches-service-hint">
              {!data.authenticated
                ? 'Sign in to link patches to specific services in your inventory.'
                : data.loading
                  ? 'Loading your services\u2026'
                  : assignableServices.length === 0
                    ? 'Publish a service to link patches directly to bookable inventory.'
                    : 'Linking a patch to a service deep-links scans into that listing\u2019s booking flow.'}
            </p>
          </div>
          <button type="button" onClick={establishPatch} className="flex w-full items-center justify-center gap-2 rounded-[18px] bg-gradient-to-r from-cyan-400 via-violet-500 to-fuchsia-500 px-4 py-3.5 text-[15px] font-black text-white shadow-xl shadow-fuchsia-950/25 ring-1 ring-white/20 transition hover:brightness-110 active:scale-[0.99]" data-testid="provider-patches-establish">
            <Plus className="h-4 w-4" strokeWidth={2.5} /> Establish Patch
          </button>
        </div>

        <div className="rounded-[22px] border border-cyan-200/20 bg-cyan-300/[0.08] p-4 shadow-inner shadow-cyan-950/15">
          <div className="mb-3 flex items-center gap-2"><Radio className="h-5 w-5 text-cyan-200" /><p className="text-[16px] font-extrabold text-white">How this gets used</p></div>
          <div className="space-y-3 text-[13px] leading-5 text-slate-200/80">
            <p><CheckCircle2 className="mr-2 inline h-4 w-4 text-emerald-300" />Verify a patch by creating it here, then opening the Test link and confirming the venue name loads.</p>
            <p><Shield className="mr-2 inline h-4 w-4 text-emerald-300" />Create one patch per entrance, booth, lot, or event checkpoint.</p>
            <p><Smartphone className="mr-2 inline h-4 w-4 text-purple-300" />Print the link as a QR code or encode it to an NFC sticker.</p>
            <p><Link className="mr-2 inline h-4 w-4 text-cyan-300" />Customers tap/scan and open Bytspot App Clip or the full app.</p>
          </div>
          <p className="mt-4 break-all rounded-2xl border border-white/10 bg-black/40 p-3 font-mono text-[11px] leading-5 text-cyan-50/75" data-testid="provider-patches-preview-url">{buildPatchUrl(nextPatchId, venueName || 'Bytspot Provider', selectedService?.id)}</p>
        </div>
      </motion.div>

      <div className="space-y-3" data-testid="provider-patches-list">
        <div className="flex items-center justify-between gap-3 px-1">
          <div>
            <h2 className="text-[18px] font-black text-white">Established patches</h2>
            <p className="text-[12px] leading-5 text-slate-300/75">Copy, test, and deploy clean patch links from one place.</p>
          </div>
        </div>
        {patches.length === 0 ? (
          <div className="rounded-[24px] border border-dashed border-cyan-200/20 bg-slate-950/55 p-6 text-center text-slate-300/80 shadow-inner shadow-black/20" data-testid="provider-patches-empty">No patches established yet. Create your first patch above.</div>
        ) : patches.map((patch, index) => (
          <motion.div key={patch.id} className="relative overflow-hidden rounded-[24px] border border-white/15 bg-[linear-gradient(135deg,rgba(15,23,42,0.9),rgba(2,6,23,0.96))] p-4 shadow-[0_18px_55px_rgba(0,0,0,0.34)] ring-1 ring-cyan-200/5" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ ...springConfig, delay: index * 0.04 }} data-testid="provider-patches-card">
            <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-cyan-300/0 via-cyan-200/50 to-fuchsia-300/0" />
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <p className="text-[16px] font-extrabold text-white">{patch.label}</p>
                <p className="text-[13px] font-semibold text-slate-300/80">{patch.venueName}</p>
                <div className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-cyan-200/20 bg-cyan-300/[0.09] px-2.5 py-1 text-[11px] font-extrabold text-cyan-50" data-testid="provider-patches-card-service">
                  <Package className="h-3 w-3" strokeWidth={2.5} />
                  {patch.serviceTitle ? patch.serviceTitle : 'Unassigned'}
                </div>
              </div>
              <span className="rounded-full border border-emerald-300/25 bg-emerald-400/10 px-2.5 py-1 text-[10px] font-black tracking-[0.12em] text-emerald-100">READY</span>
            </div>
            <p className="mb-3 break-all rounded-2xl border border-white/10 bg-black/40 p-3 font-mono text-[11px] leading-5 text-cyan-50/75 shadow-inner shadow-black/20">{patch.url}</p>
            <div className="flex gap-2">
              <button type="button" onClick={() => copyPatch(patch)} className="flex flex-1 items-center justify-center gap-2 rounded-[14px] border border-white/15 bg-white px-3 py-2.5 text-[13px] font-black text-slate-950 shadow-lg shadow-black/15 transition hover:bg-cyan-50">
                {copiedId === patch.id ? <CheckCircle2 className="h-4 w-4 text-emerald-300" /> : <Copy className="h-4 w-4" />} {copiedId === patch.id ? 'Copied' : 'Copy'}
              </button>
              <a href={patch.url} target="_blank" rel="noreferrer" className="flex flex-1 items-center justify-center gap-2 rounded-[14px] border border-cyan-200/25 bg-cyan-400/15 px-3 py-2.5 text-[13px] font-black text-cyan-50 shadow-lg shadow-cyan-950/10 transition hover:bg-cyan-300/20">
                <ExternalLink className="h-4 w-4" /> Test
              </a>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}